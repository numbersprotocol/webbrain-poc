import axios from 'axios';

/** 
 * Keep an in-memory set for deduplication. 
 *    In production, use a persistent store so it works across cold starts.
 */

export const handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  console.log("[LOG] Starting...");

  // Check for Slack retry header (handle case-insensitively)
  const headers = event.headers || {};
  const retryHeader = headers['X-Slack-Retry-Num'] || headers['x-slack-retry-num'];
  console.log("[LOG] Slack retry header:", retryHeader);

  if (retryHeader !== undefined) {
    console.log("[LOG] Detected Slack retry event (X-Slack-Retry-Num present). Immediately acknowledging.");
    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Retry event acknowledged without processing.' })
    };
  }

  // For Slack's URL verification event
  if (body.type === 'url_verification') {
    return {
      statusCode: 200,
      body: JSON.stringify({ challenge: body.challenge })
    };
  }

  // Only proceed if it's an app mention in Slack
  if (body.event && body.event.type === 'app_mention') {
    console.log("[LOG] Receive a new mention");

    try {
      // 1. Extract the Slack channel and the thread root
      const channelId = body.event.channel;
      const threadTs = body.event.thread_ts || body.event.ts;

      console.log("[LOG] Channel:", channelId, "| Thread TS:", threadTs);
      
      // 2. Fetch the entire thread from Slack
      const repliesResponse = await axios.get('https://slack.com/api/conversations.replies', {
        headers: {
          'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`
        },
        params: {
          channel: channelId,
          ts: threadTs
        }
      });
      if (!repliesResponse.data.ok) {
        console.error("[ERROR] Slack API error:", repliesResponse.data.error);
        return {
          statusCode: 200,
          body: JSON.stringify({ error: repliesResponse.data.error })
        };
      }
      //repliesResponse.data.messages is an array of all messages in the thread
      const threadMessages = repliesResponse.data.messages || [];
      console.log("[LOG] Number of messages in thread:", threadMessages.length);

      const lastIndex = threadMessages.length - 1;
      let latestMessage = threadMessages[lastIndex]?.text || "";
      latestMessage = latestMessage.replace(/<@U08AXSFDYMA>/g, "").trim();

      // If there's only 1 message, previousMessages will be an empty array
      const previousMessages = threadMessages.slice(0, lastIndex).map(msg => msg.text);

      let combinedUserContent;
      if (previousMessages.length === 0) {
        // No previous messages, just use the latest
        combinedUserContent = latestMessage;
      } else {
        // Combine latest message with a list of previous messages
        combinedUserContent = `You are an AI assistant in a multi-user conversation. The mention <@U08AXSFDYMA> is your ID. Here is the question or the request for you: ${latestMessage}. Please also consider the previous messages as the background information:\n${previousMessages.join("\n")}. Please note, mentions in the text, such as <@U09AWSFDYXX>, refer to different human users. You should consider each mention and message as part of a larger group discussion and take into account the chronological order of messages. When you produce a final response, respond as if you are participating in the conversation. If needed, feel free to reference users by their mention IDs. `;
      }
      console.log("[LOG] Combined user content:", combinedUserContent);

      // 3. Build an array of messages to send to OpenAI
      //    For simplicity, treat every Slack message as role="user"
      //    except a single system message at the start.
      //    You can get more nuanced by filtering out your bot's messages, etc.
      const openAiMessages = [
        { 
          role: 'system', 
          content: 'You are a helpful assistant. If the user writes in English, respond in English. If the user writes in Traditional Chinese, respond in Traditional Chinese, using common Taiwanese vocabulary and style. If the request is complex, break down into smaller, manageable subtasks and think again. ' 
        },
        { 
          role: 'user', 
          content: combinedUserContent
        }
      ];

      console.log("[LOG] OpenAI messages:", openAiMessages);
      
      // 4. OpenAI call:
      const openaiResponse = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: 'gpt-4o',
          messages: openAiMessages,
          // Optional parameters
          temperature: 0.7,
          //max_tokens: 1000,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
          }
        }
      );

      let openaiAnswer = openaiResponse.data.choices?.[0]?.message?.content || "I'm sorry, I have no response.";
      console.log("[LOG] OpenAI response: " + openaiAnswer);
      
      // 5. Post the GPT answer back in the same thread
      console.log("[LOG] Channel: " + body.event.channel);
      const parentTs = body.event.thread_ts || body.event.ts; // parent message's timestamp

      // Loop over each [originalTerm, newTerm] pair
      const replacements = {
        "插件": "plugin",
        "激活": "啟用",
        "添加": "新增"
      };
      Object.entries(replacements).forEach(([zh, en]) => {
        // Replace all occurrences of the Chinese term with the English term
        openaiAnswer = openaiAnswer.replace(new RegExp(zh, 'g'), en);
      });

      // console.log("[LOG] Final answer: " + openaiAnswer); 

      try {
        const response = await axios.post('https://slack.com/api/chat.postMessage', {
          channel: body.event.channel,
          text: openaiAnswer,
          thread_ts: parentTs, // speccify the parent message to reply
          reply_broadcast: false // do not broadcast to channel
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.SLACK_BOT_TOKEN}`,
            'Content-Type': 'application/json'
          }
        });

        console.log('[LOG] Request successful:', response.status);
        console.log('[LOG] Response data:', response.data);
        
      } catch (error) {
        if (error.response) {
          // Received response, but status is not 2xx
          console.error('Error status:', error.response.status);
          console.error('Error data:', error.response.data);
        } else if (error.request) {
          console.error('No response received:', error.request);
        } else {
          console.error('Request setup error:', error.message);
        }
      }

      return {
        statusCode: 200,
        body: JSON.stringify({ message: 'OK' })
      };
    } catch (error) {
      console.error('Error:', error);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Internal Server Error' })
      };
    }
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Event received' })
  };
};
