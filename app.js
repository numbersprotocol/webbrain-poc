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
    let systemPrompt = ''; // Will store the loaded prompt template
    let websiteConfigs = {}; // Will store loaded website configurations

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
    };

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
            currentWebsiteContent = '';
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
            // Check for special cases with pre-cached content
            const hardcodedContent = getHardcodedContent(url);
            if (hardcodedContent) {
                console.log(`Using pre-cached content for ${url}`);
                currentWebsiteContent = hardcodedContent;
                localStorage.setItem('websiteContent', hardcodedContent);
                
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

            // Try to find and process sitemap
            try {
                await processSitemap(url);
            } catch (sitemapError) {
                console.warn('Could not process sitemap:', sitemapError);
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
            
            // Fetch sitemap using the get-sitemap lambda function
            const lambdaUrl = `https://zhwikvdhwd.execute-api.us-east-1.amazonaws.com/default/get-sitemap?url=${encodeURIComponent(normalizedUrl)}`;
            const response = await fetch(lambdaUrl);
            
            if (!response.ok) {
                throw new Error(`Failed to fetch sitemap: ${response.status}`);
            }
            
            const sitemapXml = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(sitemapXml, 'text/xml');
            
            // Look for URLs in the sitemap
            const urlElements = xmlDoc.querySelectorAll('url > loc');
            
            if (urlElements.length > 0) {
                let addedCount = 0;
                
                for (let i = 0; i < urlElements.length && addedCount < 3; i++) {
                    const subUrl = urlElements[i].textContent;
                    
                    // Skip if it's the same as the base URL or already in our list
                    if (subUrl === baseUrl || urls.some(u => u.title === subUrl)) {
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
        // Fetch sitemap using the get-sitemap lambda function
        const lambdaUrl = `https://zhwikvdhwd.execute-api.us-east-1.amazonaws.com/default/get-sitemap?url=${encodeURIComponent(url)}`;
        const response = await fetch(lambdaUrl);
        
        if (!response.ok) {
            throw new Error(`Failed to fetch sitemap: ${response.status}`);
        }
        
        const sitemapXml = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(sitemapXml, 'text/html');
        
        // Extract meaningful content from the page
        const content = extractContent(doc);
        return content;
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
            // Get website content
            const websiteContent = currentWebsiteContent || localStorage.getItem('websiteContent');
            
            // Replace placeholder in the system prompt with actual content
            const promptWithContent = systemPrompt.replace('[WEBSITE_CONTENT_PLACEHOLDER]', websiteContent);
            
            // Prepare messages for OpenAI
            const openAiMessages = [
                { 
                    role: 'system', 
                    content: promptWithContent
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

    // Start the application
    initApp();
});
