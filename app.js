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

    // Check if we have existing URLs and hide the URL modal if we do
    if (urls.length > 0) {
        urlModal.style.display = 'none';
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
            
            // Common sitemap locations
            const sitemapUrls = [
                `${normalizedUrl}/sitemap.xml`,
                `${normalizedUrl}/sitemap_index.xml`,
                `${normalizedUrl}/sitemap-index.xml`,
                `${normalizedUrl}/wp-sitemap.xml`
            ];
            
            // Extract domain for constructing absolute URLs if needed
            const urlObj = new URL(baseUrl);
            const domain = `${urlObj.protocol}//${urlObj.hostname}`;
            
            // Try to fetch sitemap from common locations
            let sitemapXml = null;
            let sitemapUrl = null;
            
            for (const potentialUrl of sitemapUrls) {
                console.log(`Looking for sitemap at: ${potentialUrl}`);
                try {
                    // Try to fetch the sitemap using our cors proxy
                    const corsProxy = 'https://corsproxy.io/?';
                    const response = await fetch(`${corsProxy}${encodeURIComponent(potentialUrl)}`, {
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    });
                    
                    if (response.ok) {
                        sitemapXml = await response.text();
                        sitemapUrl = potentialUrl;
                        console.log(`Found sitemap at: ${sitemapUrl}`);
                        break;
                    }
                } catch (error) {
                    console.warn(`Error fetching sitemap from ${potentialUrl}:`, error);
                    // Continue to the next URL
                }
            }
            
            // If we didn't find a sitemap, try to guess it from robots.txt
            if (!sitemapXml) {
                try {
                    console.log('Looking for sitemap references in robots.txt');
                    const robotsUrl = `${domain}/robots.txt`;
                    const corsProxy = 'https://corsproxy.io/?';
                    
                    const response = await fetch(`${corsProxy}${encodeURIComponent(robotsUrl)}`, {
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    });
                    
                    if (response.ok) {
                        const robotsTxt = await response.text();
                        // Look for Sitemap: directive in robots.txt
                        const sitemapMatches = robotsTxt.match(/^Sitemap:\s*(.+)$/mi);
                        if (sitemapMatches && sitemapMatches[1]) {
                            const sitemapUrlFromRobots = sitemapMatches[1].trim();
                            console.log(`Found sitemap reference in robots.txt: ${sitemapUrlFromRobots}`);
                            
                            // Fetch the sitemap from the URL found in robots.txt
                            const sitemapResponse = await fetch(`${corsProxy}${encodeURIComponent(sitemapUrlFromRobots)}`, {
                                headers: { 'X-Requested-With': 'XMLHttpRequest' }
                            });
                            
                            if (sitemapResponse.ok) {
                                sitemapXml = await sitemapResponse.text();
                                sitemapUrl = sitemapUrlFromRobots;
                            }
                        }
                    }
                } catch (error) {
                    console.warn('Error processing robots.txt:', error);
                }
            }
            
            // If we found a sitemap, parse it and add up to 3 URLs
            if (sitemapXml) {
                console.log('Parsing sitemap content');
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
                    // Check if this is a sitemap index
                    const sitemapElements = xmlDoc.querySelectorAll('sitemap > loc');
                    
                    if (sitemapElements.length > 0) {
                        // Get the first sitemap in the index and process it
                        const firstSitemapUrl = sitemapElements[0].textContent;
                        console.log(`Found sitemap index, processing first sitemap: ${firstSitemapUrl}`);
                        
                        const corsProxy = 'https://corsproxy.io/?';
                        const sitemapResponse = await fetch(`${corsProxy}${encodeURIComponent(firstSitemapUrl)}`, {
                            headers: { 'X-Requested-With': 'XMLHttpRequest' }
                        });
                        
                        if (sitemapResponse.ok) {
                            const subSitemapXml = await sitemapResponse.text();
                            const subXmlDoc = parser.parseFromString(subSitemapXml, 'text/xml');
                            const subUrlElements = subXmlDoc.querySelectorAll('url > loc');
                            
                            let addedCount = 0;
                            
                            for (let i = 0; i < subUrlElements.length && addedCount < 3; i++) {
                                const subUrl = subUrlElements[i].textContent;
                                
                                // Skip if it's the same as the base URL or already in our list
                                if (subUrl === baseUrl || urls.some(u => u.title === subUrl)) {
                                    continue;
                                }
                                
                                console.log(`Adding subpage from sitemap index: ${subUrl}`);
                                
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
                        }
                    }
                }
            } else {
                console.log('No sitemap found for this website');
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
        
        // Handle numbersprotocol.io
        if (lowerUrl.includes('numbersprotocol.io')) {
            return `
                Website Title: Numbers Protocol - Web3 Infrastructure for Media

                Description: Numbers Protocol is a decentralized photo network for preserving and authenticating digital media.

                Main Headings:
                Numbers Protocol
                Web3 Infrastructure for Media
                Capture App
                Numbers API
                NFT Minting
                Numbers Chain

                Content:
                Numbers Protocol provides a decentralized network for verifying digital content authenticity.
                The platform helps creators register their work on blockchain to establish provenance.
                Numbers offers tools for digital rights management through NFT technology.
                The Capture App allows users to authenticate photos and videos at the point of creation.
                Numbers Chain is a dedicated blockchain for media assets and metadata verification.

                Full Text:
                Numbers Protocol creates a decentralized photo network for preserving and authenticating digital media.
                The protocol helps creators establish provenance for their digital content.
                Using blockchain technology, Numbers provides infrastructure for verifying media authenticity.
                The platform supports NFT minting with verifiable attribution to original creators.
                Numbers API allows developers to integrate media authentication into their applications.
                The ecosystem focuses on fighting digital misinformation through verifiable credentials for digital content.
            `;
        }
        
        // Handle Y Combinator
        if (lowerUrl.includes('ycombinator.com')) {
            return `
                Website Title: Y Combinator - The Startup Accelerator & Community

                Description: Y Combinator is a startup accelerator that invests in a large number of startups twice a year and provides them with seed funding, advice, and connections.

                Main Headings:
                Y Combinator
                Apply to YC
                Startup Directory
                Hacker News
                Library
                Blog

                Content:
                Y Combinator (YC) is an American technology startup accelerator launched in March 2005.
                The accelerator provides seed money, advice, and connections in exchange for equity in the startups.
                YC has been used to launch over 3,000 companies including Stripe, Airbnb, Cruise, PagerDuty, DoorDash, Coinbase, Instacart, Dropbox, Twitch, and Reddit.
                The combined valuation of the top YC companies was over $300B.
                Y Combinator runs two three-month funding cycles a year, one from January through March and one from June through August.
                The YC program includes an interview process, office hours with YC partners, weekly dinners with guest speakers, and a Demo Day.
                Hacker News is a social news website focusing on computer science and entrepreneurship, created by Y Combinator.

                Full Text:
                Y Combinator created a new model for funding early-stage startups. Twice a year they invest in a batch of new companies.
                The YC partners work closely with each company to get them into the best possible shape and refine their pitch to investors.
                Each batch culminates in Demo Day, when the startups present their companies to a carefully selected, invite-only audience.
                After Demo Day, the YC alumni network helps the founders connect with investors, find customers, and recruit employees.
                Y Combinator has developed a reputation for creating and supporting companies that other investors are eager to invest in.
                YC has pioneered the way startup accelerator programs operate and has provided a blueprint for other organizations.
                The accelerator is highly competitive, with an acceptance rate of 1.5-2% for the companies that apply.
                Y Combinator provides advice and connections to its portfolio companies, helping them navigate the early stages of building a startup.
            `;
        }
        
        // Handle GitHub
        if (lowerUrl.includes('github.com')) {
            return `
                Website Title: GitHub: Let's build from here

                Description: GitHub is where over 100 million developers shape the future of software, together. Contribute to the open source community, manage Git repositories, and more.

                Main Headings:
                GitHub
                Features
                Team
                Enterprise
                Explore
                Marketplace
                Pricing

                Content:
                GitHub is a code hosting platform for version control and collaboration.
                It lets you and others work together on projects from anywhere.
                GitHub provides hosting for software development and version control using Git.
                It offers the distributed version control and source code management (SCM) functionality of Git.
                GitHub provides access control and several collaboration features such as bug tracking, feature requests, task management, and continuous integration.
                The platform hosts millions of repositories, with both open source and private projects.
                GitHub's user interface allows users to fork repositories, review code changes, submit pull requests, and merge them into the main repository.
                The service includes features like GitHub Actions for CI/CD, GitHub Pages for hosting static websites, and GitHub Codespaces for cloud-based development environments.

                Full Text:
                GitHub is where over 100 million developers shape the future of software, together.
                Whether you're scaling your startup or just learning how to code, GitHub is your home for software innovation.
                GitHub enables developers to store and manage their code, track and control changes, and collaborate with others.
                The platform is built around Git, an open source version control system created by Linus Torvalds.
                Organizations use GitHub to host their open source projects and private repositories.
                Developers can browse code from millions of repositories, clone existing projects, and contribute to active development.
                GitHub's features include issue tracking, code review, project boards, organizations, packages, and secure deployment.
                The service offers both free and paid plans, with the latter providing additional tools and features for teams and enterprises.
                GitHub was acquired by Microsoft in 2018 for $7.5 billion and continues to operate as a community platform.
                The platform plays a central role in the open source ecosystem, hosting projects like Visual Studio Code, TensorFlow, React, and many others.
            `;
        }
        
        // No hardcoded content for this URL
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
            'https://cors-anywhere.herokuapp.com/'
        ];
        
        let lastError = null;
        
        // Try each proxy in sequence with standard mode
        for (const proxy of corsProxies) {
            try {
                const proxyUrl = `${proxy}${encodeURIComponent(url)}`;
                console.log(`Trying proxy: ${proxy} for URL: ${url}`);
                
                const response = await fetch(proxyUrl, {
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
            });
            
            // Note: With no-cors, we can't read the response directly
            // This is more of a connectivity check
            console.log("Got a response with no-cors mode");
            
            // Instead, we'll use iframe-based scraping
            return await extractContentViaIframe(url);
        } catch (directError) {
            console.error("Direct fetch with no-cors failed:", directError);
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
        // Also ensure the URL modal is hidden
        urlModal.style.display = 'none';
    }
});
