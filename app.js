document.addEventListener('DOMContentLoaded', () => {
    const urlInput = document.getElementById('url-input');
    const addUrlBtn = document.getElementById('add-url-btn');
    const urlList = document.getElementById('url-list');
    const chatInput = document.getElementById('chat-input');
    const sendMessageBtn = document.getElementById('send-message-btn');
    const chatContainer = document.getElementById('chat-container');
    const initialUrlInput = document.getElementById('initial-url-input');
    const initialUrlBtn = document.getElementById('initial-url-btn');
    const initialStatus = document.getElementById('initial-status');
    const urlModal = document.getElementById('url-modal');
    const apiKeyModal = document.getElementById('api-key-modal');
    const apiKeyInput = document.getElementById('api-key-input');
    const apiKeySaveBtn = document.getElementById('api-key-save-btn');
    const redBar = document.getElementById('red-bar');
    const createStoreIdBtn = document.getElementById('create-store-id-btn');

    let urls = JSON.parse(localStorage.getItem('urls')) || [];
    let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
    let currentWebsiteContent = [];
    let systemPrompt = ''; // Will store the loaded prompt template
    let websiteConfigs = {}; // Will store loaded website configurations
    let fileIds = JSON.parse(localStorage.getItem('fileIds')) || []; // Store OpenAI file IDs

    // Load the system prompt from the YAML file
    const loadSystemPrompt = async () => {
        try {
            const response = await fetch('config/prompts.yml');
            if (!response.ok) {
                throw new Error(`Failed to load prompt config: ${response.status}`);
            }
            const yamlText = await response.text();
            // Simple YAML parsing for the system_prompt field
            const match = yamlText.match(/system_prompt:\s*\|\s*([\s\S]+?)(?:$|(?=\n\w+:))/);
            if (match && match[1]) {
                systemPrompt = match[1].trim();
                console.log('System prompt loaded successfully');
            } else {
                throw new Error('Could not parse system_prompt from YAML');
            }
        } catch (error) {
            console.error('Error loading system prompt:', error);
            // Fallback to default prompt if loading fails
            systemPrompt = `You are an friendly AI assistant to help users learn more about the website content. You are expected to always respond with references. For example, if I ask you "What is Numbers Protocol?", you will reply "Based on https://numbersprotocol.io, it is a decentralized network". You will do your best to look for answers from the website content instead of the pre-existing memory. Here is the website content:
            
            [WEBSITE_CONTENT_PLACEHOLDER]`;
        }
    };

    // Load website configuration data
    const loadWebsiteConfigs = async () => {
        const websites = [
            { domain: 'numbersprotocol.io', configFile: 'config/websites/numbersprotocol.yml' },
            { domain: 'ycombinator.com', configFile: 'config/websites/ycombinator.yml' },
            { domain: 'github.com', configFile: 'config/websites/github.yml' }
        ];
        
        for (const website of websites) {
            try {
                console.log(`Loading configuration for ${website.domain}...`);
                const response = await fetch(website.configFile);
                
                if (!response.ok) {
                    throw new Error(`Failed to load website config: ${response.status}`);
                }
                
                const yamlText = await response.text();
                // Simple YAML parsing for the website_content field
                const match = yamlText.match(/website_content:\s*\|\s*([\s\S]+?)(?:$|(?=\n\w+:))/);
                
                if (match && match[1]) {
                    websiteConfigs[website.domain] = match[1].trim();
                    console.log(`Configuration for ${website.domain} loaded successfully`);
                } else {
                    throw new Error(`Could not parse website_content from YAML for ${website.domain}`);
                }
            } catch (error) {
                console.error(`Error loading ${website.domain} configuration:`, error);
            }
        }
    };

    // Initialize the application
    const initApp = async () => {
        // Load configurations in parallel
        await Promise.all([
            loadSystemPrompt(),
            loadWebsiteConfigs()
        ]);
        
        // Check if API key exists, if not show the API key modal
        if (!localStorage.getItem('openaiApiKey')) {
            apiKeyModal.style.display = 'flex';
        }
    
        // Check if we have existing URLs and hide the URL modal if we do
        if (urls.length > 0) {
            urlModal.style.display = 'none';
        }
        
        // Initialize UI
        renderUrls();
        renderChat();
    
        // If we have processed URLs, enable the chat
        if (urls.some(url => url.status === 'ready')) {
            enableChat();
            // Also ensure the URL modal is hidden
            urlModal.style.display = 'none';
        }

        // Check if vector store ID is missing and openaiApiKey is present
        if (localStorage.getItem('openaiApiKey') && !localStorage.getItem('vector_store_id')) {
            redBar.style.display = 'block';
        }
    };

    // Save API key
    apiKeySaveBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('openaiApiKey', apiKey);
            await createVectorStore(apiKey);
            apiKeyModal.style.display = 'none';
        } else {
            alert('Please enter a valid OpenAI API key');
        }
    });

    const createVectorStore = async (apiKey) => {
        try {
            const response = await fetch('https://api.openai.com/v1/vector_stores', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    name: 'knowledge_base'
                })
            });

            const data = await response.json();
            if (data.id) {
                localStorage.setItem('vector_store_id', data.id);
                console.log('Vector store created successfully:', data.id);
                redBar.style.display = 'none'; // Hide the red bar after successful creation
            } else {
                throw new Error('Failed to create vector store');
            }
        } catch (error) {
            console.error('Error creating vector store:', error);
            alert('Error creating vector store. Please try again.');
        }
    };

    const renderUrls = () => {
        urlList.innerHTML = '';
        urls.forEach((url, index) => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="url-title">${url.title}</span>
                <div class="url-actions">
                    <span class="url-status ${url.status}">${url.status}</span>
                    <button class="delete-url-btn" data-index="${index}">×</button>
                </div>
            `;
            urlList.appendChild(li);
        });
        
        // Add event listeners to delete buttons
        document.querySelectorAll('.delete-url-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const index = e.target.dataset.index;
                deleteUrl(index);
            });
        });
    };

    const deleteUrl = (index) => {
        // Remove the URL from the array
        urls.splice(index, 1);
        
        // Update localStorage
        localStorage.setItem('urls', JSON.stringify(urls));
        
        // Re-render the URL list
        renderUrls();
        
        // If we deleted all URLs, clear the chat and disable it
        if (urls.length === 0) {
            chatHistory = [];
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
            localStorage.removeItem('websiteContent');
            currentWebsiteContent = [];
            renderChat();
            chatInput.disabled = true;
            sendMessageBtn.disabled = true;
        } else if (urls.some(url => url.status === 'ready')) {
            // If there's still at least one processed URL, ensure chat is enabled
            enableChat();
        }
    };

    const renderChat = () => {
        chatContainer.innerHTML = '';
        if (chatHistory.length === 0) {
            chatContainer.innerHTML = `
                <div class="welcome-message">
                    <p>Welcome to WebBrain! Add a website URL to start chatting with an AI that knows about it.</p>
                </div>
            `;
            return;
        }
        
        chatHistory.forEach(message => {
            const div = document.createElement('div');
            div.className = `message ${message.sender}`;
            div.innerHTML = marked.parse(message.text); // Use marked to parse Markdown
            chatContainer.appendChild(div);
        });
        
        // Scroll to the bottom of chat
        chatContainer.scrollTop = chatContainer.scrollHeight;
    };

    const addUrl = async (url) => {
        if (!isValidUrl(url)) {
            alert('Please enter a valid URL.');
            return;
        }

        // Check if API key exists
        if (!localStorage.getItem('openaiApiKey')) {
            apiKeyModal.style.display = 'flex';
            return;
        }

        const urlObj = { title: url, status: 'loading' };
        urls.push(urlObj);
        localStorage.setItem('urls', JSON.stringify(urls));
        renderUrls();

        try {
            // Check for special cases with pre-cached content
            const hardcodedContent = getHardcodedContent(url);
            if (hardcodedContent) {
                console.log(`Using pre-cached content for ${url}`);
                currentWebsiteContent = [hardcodedContent];
                localStorage.setItem('websiteContent', JSON.stringify(currentWebsiteContent));
                
                urlObj.status = 'ready';
                localStorage.setItem('urls', JSON.stringify(urls));
                renderUrls();
                
                // Clear previous chat history when adding a new URL
                chatHistory = [];
                localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                renderChat();
                
                enableChat();

                // Try to find and process sitemap after successfully processing the main URL
                try {
                    await processSitemap(url);
                } catch (sitemapError) {
                    console.warn('Could not process sitemap:', sitemapError);
                }
                return;
            }

            // Normal case - try to fetch website content
            console.log(`Attempting to fetch content from ${url}...`);
            await processSitemap(url);
            const newFileIds = await fetchWebsiteContent(url);
            
            if (newFileIds && newFileIds.length > 0) {
                // Store file IDs
                fileIds = [...fileIds, ...newFileIds];
                localStorage.setItem('fileIds', JSON.stringify(fileIds));
                
                // We don't need to store website content anymore as it's in OpenAI
                // But for backward compatibility, keep the object structure
                currentWebsiteContent = ['Content stored as embeddings in OpenAI'];
                localStorage.setItem('websiteContent', JSON.stringify(currentWebsiteContent));
                
                urlObj.status = 'ready';
                localStorage.setItem('urls', JSON.stringify(urls));
                renderUrls();
                
                // Clear previous chat history when adding a new URL
                chatHistory = [];
                localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
                renderChat();
                
                enableChat();
            } else {
                throw new Error('Failed to process website content');
            }
        } catch (error) {
            urlObj.status = 'error';
            localStorage.setItem('urls', JSON.stringify(urls));
            renderUrls();
            
            console.error('Error processing URL:', error);
            alert(`Error processing URL: ${error.message}`);
        }
    };

    // Process sitemap to find additional URLs
    const processSitemap = async (baseUrl) => {
        try {
            // Remove trailing slash if present
            const normalizedUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            
            // List of potential sitemap URLs
            const potentialSitemapUrls = [
                `${normalizedUrl}/sitemap.xml`,
                `${normalizedUrl}/sitemap_index.xml`,
                `${normalizedUrl}/sitemap1.xml`,
                `${normalizedUrl}/sitemap-index.xml`,
                `${normalizedUrl}/sitemapindex.xml`
            ];
            
            let sitemapData = null;
            
            for (const sitemapUrl of potentialSitemapUrls) {
                try {
                    // Construct the lambda URL with the target sitemap URL
                    const lambdaUrl = `https://zhwikvdhwd.execute-api.us-east-1.amazonaws.com/default/get-sitemap?url=${encodeURIComponent(sitemapUrl)}`;
                    
                    // Fetch the sitemap content from the lambda function
                    const response = await fetch(lambdaUrl);
                    if (response.ok) {
                        const jsonResponse = await response.json();
                        
                        if (jsonResponse.success) {
                            sitemapData = jsonResponse.data;
                            console.log(`Successfully retrieved sitemap from ${sitemapUrl}. Type: ${sitemapData.type}`);
                            break; // Exit loop if we successfully fetch a sitemap
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to fetch sitemap from ${sitemapUrl}:`, error);
                }
            }
            
            if (!sitemapData) {
                throw new Error('Failed to fetch any sitemap');
            }
            
            // Extract URLs based on the sitemap type
            let urlList = [];
            
            if (sitemapData.type === 'standard_sitemap' && sitemapData.urls) {
                // Extract URLs from standard sitemap
                urlList = sitemapData.urls.map(url => url.loc).filter(loc => loc);
                console.log(`Found ${urlList.length} URLs in standard sitemap`);
            } else if (sitemapData.type === 'sitemap_index' && sitemapData.sitemaps) {
                // Extract sitemap URLs from sitemap index
                urlList = sitemapData.sitemaps.map(sitemap => sitemap.loc).filter(loc => loc);
                console.log(`Found ${urlList.length} sitemap references in sitemap index`);
            } else {
                console.log(`Unrecognized sitemap type: ${sitemapData.type}`);
            }
            
            if (urlList.length > 0) {
                let addedCount = 0;
                
                for (let i = 0; i < urlList.length && addedCount < 3; i++) {
                    const subUrl = urlList[i];
                    
                    // Skip if it's the same as the base URL or already in our list
                    if (subUrl === baseUrl || urls.some(u => u.title === subUrl)) {
                        continue;
                    }
                    
                    // Skip if it's a sitemap file rather than a content URL (for sitemap index case)
                    if (sitemapData.type === 'sitemap_index' && subUrl.endsWith('.xml')) {
                        console.log(`Skipping sitemap reference: ${subUrl}`);
                        continue;
                    }
                    
                    console.log(`Adding subpage from sitemap: ${subUrl}`);
                    
                    // Add this URL to the list but don't process it yet
                    const urlObj = { title: subUrl, status: 'ready' };
                    urls.push(urlObj);
                    addedCount++;
                }
                
                if (addedCount > 0) {
                    localStorage.setItem('urls', JSON.stringify(urls));
                    renderUrls();
                    alert(`Added ${addedCount} additional pages from the sitemap.`);
                }
            } else {
                console.log('No URLs found in the sitemap');
            }
        } catch (error) {
            console.error('Error processing sitemap:', error);
            throw error;
        }
    };

    // Add function to provide hardcoded content for common websites
    const getHardcodedContent = (url) => {
        // Convert URL to lowercase for case-insensitive comparison
        const lowerUrl = url.toLowerCase();
        
        // Check each supported domain against the URL
        for (const domain in websiteConfigs) {
            if (lowerUrl.includes(domain)) {
                console.log(`Using configured content for ${domain}`);
                return websiteConfigs[domain];
            }
        }
        
        // No configured content for this URL
        return null;
    };

    const isValidUrl = (url) => {
        try {
            new URL(url);
            return true;
        } catch (_) {
            return false;
        }
    };

    const fetchWebsiteContent = async (url) => {
        const lambdaEndpoint = 'https://otybap4xr0.execute-api.us-east-1.amazonaws.com/default/get-webpage';
        const urlsToFetch = [url, ...urls.filter(u => u.status === 'ready').map(u => u.title)];
        const newFileIds = [];
        const vectorStoreId = localStorage.getItem('vector_store_id');
        const apiKey = localStorage.getItem('openaiApiKey'); // Retrieve api_key from localStorage

        for (const targetUrl of urlsToFetch) {
            try {
                // Include vector_store_id and api_key in the request to associate files with the vector store
                const lambdaUrl = `${lambdaEndpoint}?url=${encodeURIComponent(targetUrl)}&api_key=${encodeURIComponent(apiKey)}&vector_store_id=${encodeURIComponent(vectorStoreId)}`;
                const response = await fetch(lambdaUrl);
                
                if (response.ok) {
                    const jsonResponse = await response.json();
                    
                    if (jsonResponse.file_id) {
                        console.log(`File created for URL: ${targetUrl}, File ID: ${jsonResponse.file_id}`);
                        newFileIds.push({
                            url: targetUrl,
                            fileId: jsonResponse.file_id
                        });
                    } else {
                        console.warn(`No file ID returned for URL: ${targetUrl}`);
                    }
                } else {
                    console.warn(`Failed to fetch content for URL: ${targetUrl}`);
                }
            } catch (error) {
                console.error(`Error fetching content for URL: ${targetUrl}`, error);
            }
        }

        return newFileIds;
    };

    const processChat = async (userMessage) => {
        const apiKey = localStorage.getItem('openaiApiKey');
        if (!apiKey) {
            apiKeyModal.style.display = 'flex';
            return;
        }

        try {
            // Check if we have file IDs for vector search
            const storedFileIds = JSON.parse(localStorage.getItem('fileIds')) || [];
            const vectorStoreId = localStorage.getItem('vector_store_id');
            
            // Get website content for fallback or context enrichment
            const websiteContent = currentWebsiteContent.length > 0 ? 
                currentWebsiteContent.join('\n') : 
                JSON.parse(localStorage.getItem('websiteContent') || '[""]')[0];
            
            // Replace placeholder in the system prompt with appropriate content
            const promptWithContent = systemPrompt.replace(
                '[WEBSITE_CONTENT_PLACEHOLDER]', 
                vectorStoreId ? 'Content is available in the vector store.' : websiteContent
            );
            
            // Previous conversation context (limited to last few messages)
            const previousMessages = chatHistory.slice(-4);
            let conversationContext = '';
            /*
            if (previousMessages.length > 0) {
                conversationContext = previousMessages.map(msg => 
                    `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`
                ).join('\n\n');
                conversationContext += '\n\n';
            }
            */
            // Full input for the API
            const fullInput = `${promptWithContent}\n\n${conversationContext}User: ${userMessage}`;
            
            // Add debugging message to show fullInput in console
            console.log('Debug - Full input to OpenAI:', fullInput);
            console.log('Debug - Full input length (chars):', fullInput.length);
            
            // Prepare the request payload for /v1/responses endpoint
            const requestPayload = {
                model: 'gpt-4o-mini',
                input: fullInput
            };
            
            // If we have a vector store, add the file_search tool
            if (vectorStoreId) {
                requestPayload.tools = [
                    {
                        type: "file_search",
                        vector_store_ids: [vectorStoreId],
                        max_num_results: 20
                    }
                ];
            }

            // OpenAI API call to the responses endpoint
            console.log('Debug - request payload', requestPayload);
            const response = await fetch('https://api.openai.com/v1/responses', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify(requestPayload)
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message || 'Error from OpenAI API');
            }

            // Extract the AI response from the new endpoint format
            // The output is now an array that can contain different types of responses
            let aiResponse = "I couldn't generate a response based on the website content. Please try asking a different question.";
            
            if (data.output) {
                // Look for message type outputs
                const messageOutputs = data.output.filter(item => item.type === 'message');
                
                if (messageOutputs.length > 0) {
                    const messageContent = messageOutputs[0].content;
                    if (messageContent && messageContent.length > 0) {
                        // Extract the text from the first content item
                        const textContent = messageContent.filter(item => item.type === 'output_text');
                        if (textContent.length > 0) {
                            aiResponse = textContent[0].text;
                            
                            // Check if there are file citations
                            if (textContent[0].annotations && textContent[0].annotations.length > 0) {
                                const citations = textContent[0].annotations.filter(ann => ann.type === 'file_citation');
                                if (citations.length > 0) {
                                    console.log(`Response includes ${citations.length} file citations`);
                                    // You could process citations here if needed
                                }
                            }
                        }
                    }
                }
            }

            return marked.parse(aiResponse); // Use marked to parse Markdown
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error(`AI processing error: ${error.message}`);
        }
    };

    const enableChat = () => {
        chatInput.disabled = false;
        sendMessageBtn.disabled = false;
    };

    const sendMessage = async () => {
        const userMessage = chatInput.value.trim();
        if (!userMessage) return;

        // Add user message to chat
        chatHistory.push({ sender: 'user', text: userMessage });
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        renderChat();

        // Clear input and disable button while processing
        chatInput.value = '';
        sendMessageBtn.disabled = true;

        // Show typing indicator
        const typingIndicator = document.createElement('div');
        typingIndicator.className = 'message ai typing';
        typingIndicator.textContent = 'Thinking...';
        chatContainer.appendChild(typingIndicator);
        chatContainer.scrollTop = chatContainer.scrollHeight;

        try {
            // Process with OpenAI
            const aiResponse = await processChat(userMessage);
            
            // Remove typing indicator
            chatContainer.removeChild(typingIndicator);
            
            // Add AI response to chat
            chatHistory.push({ sender: 'ai', text: aiResponse });
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
            renderChat();
        } catch (error) {
            // Remove typing indicator
            chatContainer.removeChild(typingIndicator);
            
            // Add error message to chat
            chatHistory.push({ sender: 'ai', text: `Error: ${error.message}. Please try again.` });
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
            renderChat();
            
            console.error('Error sending message:', error);
        } finally {
            sendMessageBtn.disabled = false;
            chatInput.focus();
        }
    };

    // Event listeners
    addUrlBtn.addEventListener('click', () => addUrl(urlInput.value));
    
    sendMessageBtn.addEventListener('click', sendMessage);
    
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            sendMessage();
        }
    });
    
    initialUrlBtn.addEventListener('click', async () => {
        const url = initialUrlInput.value;
        if (!isValidUrl(url)) {
            alert('Please enter a valid URL.');
            return;
        }

        initialStatus.style.display = 'flex';
        try {
            await addUrl(url);
            urlModal.style.display = 'none';
        } catch (error) {
            console.error('Error processing initial URL:', error);
            initialStatus.style.display = 'none';
            alert(`Error processing URL: ${error.message}`);
        }
    });

    initialUrlInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            initialUrlBtn.click();
        }
    });

    apiKeyInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            apiKeySaveBtn.click();
        }
    });

    createStoreIdBtn.addEventListener('click', () => {
        const apiKey = localStorage.getItem('openaiApiKey');
        if (apiKey) {
            // Clear all existing data
            localStorage.removeItem('chatHistory');
            localStorage.removeItem('urls');
            localStorage.removeItem('websiteContent');
            localStorage.removeItem('fileIds');
            chatHistory = [];
            urls = [];
            currentWebsiteContent = [];
            fileIds = [];
            renderChat();
            renderUrls();
            chatInput.disabled = true;
            sendMessageBtn.disabled = true;

            // Display message to inform the user
            alert('Previous data has been cleared due to store ID recreation. Please input website URL(s) again to rebuild the knowledge base.');

            // Show the URL modal to prompt the user to input website URL(s) again
            urlModal.style.display = 'flex';

            createVectorStore(apiKey);
        } else {
            apiKeyModal.style.display = 'flex';
        }
    });

    // Start the application
    initApp();
});
