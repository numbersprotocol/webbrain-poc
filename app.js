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

    let urls = JSON.parse(localStorage.getItem('urls')) || [];
    let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];
    let currentWebsiteContent = '';

    // Check if API key exists, if not show the API key modal
    if (!localStorage.getItem('openaiApiKey')) {
        apiKeyModal.style.display = 'flex';
    }

    // Save API key
    apiKeySaveBtn.addEventListener('click', () => {
        const apiKey = apiKeyInput.value.trim();
        if (apiKey) {
            localStorage.setItem('openaiApiKey', apiKey);
            apiKeyModal.style.display = 'none';
        } else {
            alert('Please enter a valid OpenAI API key');
        }
    });

    const renderUrls = () => {
        urlList.innerHTML = '';
        urls.forEach(url => {
            const li = document.createElement('li');
            li.innerHTML = `
                <span class="url-title">${url.title}</span>
                <span class="url-status ${url.status}">${url.status}</span>
            `;
            urlList.appendChild(li);
        });
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
            div.textContent = message.text;
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
            // Try to fetch website content
            const content = await fetchWebsiteContent(url);
            currentWebsiteContent = content;
            
            // Store content in local storage (may be limited by storage size)
            localStorage.setItem('websiteContent', content);
            
            urlObj.status = 'ready';
            localStorage.setItem('urls', JSON.stringify(urls));
            renderUrls();
            
            // Clear previous chat history when adding a new URL
            chatHistory = [];
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
            renderChat();
            
            enableChat();
        } catch (error) {
            urlObj.status = 'error';
            localStorage.setItem('urls', JSON.stringify(urls));
            renderUrls();
            
            if (error.message.includes('CORS')) {
                alert('CORS error: Unable to access the website directly. Try a website that has CORS enabled or consider using a proxy server.');
            } else {
                alert('Error processing URL: ' + error.message);
            }
            console.error('Error processing URL:', error);
        }
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
        try {
            const response = await fetch(`https://cors-anywhere.herokuapp.com/${url}`, {
                headers: {
                    'X-Requested-With': 'XMLHttpRequest'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            
            // Extract meaningful content from the page
            const content = extractContent(doc);
            return content;
        } catch (error) {
            // Try direct fetch as fallback
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const text = await response.text();
                const parser = new DOMParser();
                const doc = parser.parseFromString(text, 'text/html');
                
                // Extract meaningful content from the page
                const content = extractContent(doc);
                return content;
            } catch (directError) {
                throw new Error(`CORS error: ${directError.message}`);
            }
        }
    };

    const extractContent = (doc) => {
        // Remove script and style elements
        const scripts = doc.getElementsByTagName('script');
        const styles = doc.getElementsByTagName('style');
        
        for (let i = scripts.length - 1; i >= 0; i--) {
            scripts[i].parentNode.removeChild(scripts[i]);
        }
        
        for (let i = styles.length - 1; i >= 0; i--) {
            styles[i].parentNode.removeChild(styles[i]);
        }
        
        // Get text from body, title, meta description, and headings
        const title = doc.querySelector('title')?.innerText || '';
        const metaDesc = doc.querySelector('meta[name="description"]')?.getAttribute('content') || '';
        const headings = Array.from(doc.querySelectorAll('h1, h2, h3, h4, h5, h6')).map(h => h.innerText).join('\n');
        const paragraphs = Array.from(doc.querySelectorAll('p')).map(p => p.innerText).join('\n');
        
        return `
            Website Title: ${title}
            
            Description: ${metaDesc}
            
            Main Headings:
            ${headings}
            
            Content:
            ${paragraphs}
            
            Full Text:
            ${doc.body.innerText}
        `;
    };

    const processChat = async (userMessage) => {
        const apiKey = localStorage.getItem('openaiApiKey');
        if (!apiKey) {
            apiKeyModal.style.display = 'flex';
            return;
        }

        try {
            // Prepare messages for OpenAI
            const openAiMessages = [
                { 
                    role: 'system', 
                    content: `You are a friendly AI assistant to help users learn more about the website content. You are expected to always respond with references. For example, if I ask you "What is Numbers Protocol?", you will reply "Based on https://numbersprotocol.io, it is a decentralized network". You will do your best to look for answers from the website content instead of the pre-existing memory. Here is the website content:
                    
                    ${currentWebsiteContent || localStorage.getItem('websiteContent')}`
                },
                { 
                    role: 'user', 
                    content: userMessage
                }
            ];

            // Add previous conversation context (limited to last few messages)
            const previousMessages = chatHistory.slice(-4);
            if (previousMessages.length > 0) {
                previousMessages.forEach(msg => {
                    openAiMessages.splice(1, 0, { 
                        role: msg.sender === 'user' ? 'user' : 'assistant', 
                        content: msg.text 
                    });
                });
            }

            // OpenAI API call
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    messages: openAiMessages,
                    temperature: 0.7,
                })
            });

            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error.message || 'Error from OpenAI API');
            }

            // Extract the AI response
            return data.choices[0].message.content;
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

    // Initialize UI
    renderUrls();
    renderChat();

    // If we have processed URLs, enable the chat
    if (urls.some(url => url.status === 'ready')) {
        enableChat();
    }
});
