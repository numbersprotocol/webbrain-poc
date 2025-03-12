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
            
            // List of potential sitemap URLs
            const potentialSitemapUrls = [
                `${normalizedUrl}/sitemap.xml`,
                `${normalizedUrl}/sitemap_index.xml`,
                `${normalizedUrl}/sitemap1.xml`,
                `${normalizedUrl}/sitemap-index.xml`,
                `${normalizedUrl}/sitemapindex.xml`
            ];
            
            let sitemapXml = null;
            
            for (const sitemapUrl of potentialSitemapUrls) {
                try {
                    // Construct the lambda URL with the target sitemap URL
                    const lambdaUrl = `https://zhwikvdhwd.execute-api.us-east-1.amazonaws.com/default/get-sitemap?url=${encodeURIComponent(sitemapUrl)}`;
                    
                    // Fetch the sitemap content from the lambda function
                    const response = await fetch(lambdaUrl);
                    if (response.ok) {
                        sitemapXml = await response.text();
                        console.log(`Successfully retrieved sitemap from ${sitemapUrl}. Content preview:`, sitemapXml.substring(0, 500) + (sitemapXml.length > 500 ? '...' : ''));
                        break; // Exit loop if we successfully fetch a sitemap
                    }
                } catch (error) {
                    console.warn(`Failed to fetch sitemap from ${sitemapUrl}:`, error);
                }
            }
            
            if (!sitemapXml) {
                throw new Error('Failed to fetch any sitemap');
            }
            
            // Process the fetched sitemap content to extract URLs
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(sitemapXml, 'text/xml');
            
            // Check if it's a sitemap or a sitemap index
            let urlElements = [];
            
            // First check if it's a sitemap index (contains multiple sitemaps)
            const sitemapLocElements = xmlDoc.getElementsByTagNameNS('*', 'loc');
            
            if (sitemapLocElements.length > 0) {
                console.log(`Found ${sitemapLocElements.length} loc elements in the sitemap`);
                
                // Convert to array and extract URLs
                urlElements = Array.from(sitemapLocElements).map(element => element.textContent);
                
                console.log(`Extracted URLs: ${urlElements.slice(0, 3).join(', ')}${urlElements.length > 3 ? '...' : ''}`);
            } else {
                console.log('No loc elements found in the sitemap');
            }
            
            if (urlElements.length > 0) {
                let addedCount = 0;
                
                for (let i = 0; i < urlElements.length && addedCount < 3; i++) {
                    const subUrl = urlElements[i];
                    
                    // Skip if it's the same as the base URL or already in our list
                    if (subUrl === baseUrl || urls.some(u => u.title === subUrl)) {
                        continue;
                    }
                    
                    // Skip if it's a sitemap file rather than a content URL
                    if (subUrl.endsWith('.xml')) {
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
        // List of CORS proxies to try (in order)
        const corsProxies = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url=',
            'https://cors-anywhere.herokuapp.com/',
            'https://crossorigin.me/',
            'https://thingproxy.freeboard.io/fetch/'
        ];
        
        let lastError = null;
        
        // Try with the more flexible allorigins.win/get approach first (includes response headers)
        try {
            const allOriginsProxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&charset=UTF-8`;
            console.log(`Trying enhanced AllOrigins proxy for URL: ${url}`);
            
            const response = await fetch(allOriginsProxyUrl);
            
            if (response.ok) {
                const data = await response.json();
                if (data && data.contents) {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(data.contents, 'text/html');
                    const content = extractContent(doc);
                    return content;
                }
            }
        } catch (error) {
            console.warn(`Error with enhanced AllOrigins proxy:`, error);
        }
        
        // Try each proxy in sequence with standard mode
        for (const proxy of corsProxies) {
            try {
                const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
                console.log(`Trying proxy: ${proxy} for URL: ${url}`);
                
                const response = await fetch(proxyUrl, {
                    headers: {
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
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
                console.warn(`Error with proxy ${proxy}:`, error);
                lastError = error;
                // Continue to the next proxy
            }
        }
        
        // Try with no-cors mode
        try {
            console.log("Trying direct fetch with no-cors mode...");
            const response = await fetch(url, { 
                mode: 'no-cors',
                cache: 'no-cache',
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            
            console.log("Got a response with no-cors mode");
            
            // Instead, we'll use iframe-based scraping
            return await extractContentViaIframe(url);
        } catch (directError) {
            console.error("Direct fetch with no-cors failed:", directError);
        }

        // Try an alternative "soft" scrape approach
        try {
            console.log("Trying alternate extraction method...");
            return await extractWithMetadata(url);
        } catch (metaError) {
            console.error("Metadata extraction failed:", metaError);
        }
        
        // Fallback to our final method: Google's cached version
        try {
            console.log("Trying Google's cached version...");
            const googleCache = `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
            console.log(`Accessing: ${googleCache}`);
            
            const response = await fetch(googleCache);
            
            if (!response.ok) {
                throw new Error(`HTTP error from Google cache! status: ${response.status}`);
            }
            
            const text = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(text, 'text/html');
            
            const content = extractContent(doc);
            return content;
        } catch (cacheError) {
            console.error("Google cache access failed:", cacheError);
        }

        // If all methods fail, create some minimal content about the site
        console.error("All content extraction methods failed");
        throw new Error(`Unable to access content from ${url}. Please try another website.`);
    };

    // New function to extract content via an iframe
    const extractContentViaIframe = (url) => {
        return new Promise((resolve, reject) => {
            console.log("Creating iframe for content extraction...");
            
            // Create a temporary hidden iframe
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = url;
            
            // Set a timeout in case the iframe doesn't load
            const timeout = setTimeout(() => {
                document.body.removeChild(iframe);
                reject(new Error("Iframe loading timed out"));
            }, 15000); // 15 seconds timeout
            
            // When the iframe loads, try to extract content
            iframe.onload = () => {
                clearTimeout(timeout);
                try {
                    // Try to access the iframe content (may fail due to CORS)
                    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                    const content = extractContent(iframeDoc);
                    
                    // Remove the iframe when done
                    document.body.removeChild(iframe);
                    resolve(content);
                } catch (error) {
                    document.body.removeChild(iframe);
                    reject(new Error("Could not access iframe content due to CORS restrictions"));
                }
            };
            
            // Handle iframe loading errors
            iframe.onerror = () => {
                clearTimeout(timeout);
                document.body.removeChild(iframe);
                reject(new Error("Failed to load iframe"));
            };
            
            // Add the iframe to the document to start loading
            document.body.appendChild(iframe);
        });
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

    // Add a new function to extract basic metadata when full content isn't available
    const extractWithMetadata = async (url) => {
        try {
            // Extract domain from URL
            const urlObj = new URL(url);
            const domain = urlObj.hostname;
            const pathname = urlObj.pathname;
            
            // Use search engines to find basic information
            const description = `This appears to be content from ${domain}${pathname}.`;
            
            // Try to guess page title from URL path
            let title = domain;
            if (pathname && pathname !== '/') {
                // Clean up the pathname to create something readable
                const pathSegments = pathname.split('/').filter(segment => segment.length > 0);
                if (pathSegments.length > 0) {
                    // Convert last segment from slug to title (e.g., "my-article-title" -> "My Article Title")
                    const lastSegment = pathSegments[pathSegments.length - 1];
                    const cleanTitle = lastSegment
                        .replace(/[-_]/g, ' ')
                        .replace(/\.html$|\.php$|\.asp$/i, '')
                        .split(' ')
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                        
                    title = cleanTitle || title;
                }
            }
            
            // Create a basic content structure with available information
            return `
                Website Title: ${title}
                
                URL: ${url}
                
                Domain: ${domain}
                
                Description: ${description}
                
                Note: Full content extraction was not possible. This is limited information derived from the URL.
                
                To learn more about this website, please visit it directly at ${url}.
            `;
        } catch (error) {
            console.error("Metadata extraction failed:", error);
            throw error;
        }
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
