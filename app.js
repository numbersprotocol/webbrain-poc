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

    let urls = JSON.parse(localStorage.getItem('urls')) || [];
    let chatHistory = JSON.parse(localStorage.getItem('chatHistory')) || [];

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
        chatHistory.forEach(message => {
            const div = document.createElement('div');
            div.className = `message ${message.sender}`;
            div.textContent = message.text;
            chatContainer.appendChild(div);
        });
    };

    const addUrl = async (url) => {
        if (!isValidUrl(url)) {
            alert('Please enter a valid URL.');
            return;
        }

        const urlObj = { title: url, status: 'loading' };
        urls.push(urlObj);
        localStorage.setItem('urls', JSON.stringify(urls));
        renderUrls();

        try {
            const content = await fetchWebsiteContent(url);
            const processedContent = await processContentWithOpenAI(content);
            urlObj.status = 'ready';
            localStorage.setItem('urls', JSON.stringify(urls));
            renderUrls();
            enableChat();
        } catch (error) {
            urlObj.status = 'error';
            localStorage.setItem('urls', JSON.stringify(urls));
            renderUrls();
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
        const response = await fetch(url);
        const text = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        return doc.body.innerText;
    };

    const processContentWithOpenAI = async (content) => {
        const response = await fetch('https://api.openai.com/v1/engines/davinci-codex/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('openaiApiKey')}`
            },
            body: JSON.stringify({
                prompt: `You are an AI assistant. Here is the website content:\n\n${content}\n\n`,
                max_tokens: 1500
            })
        });
        const data = await response.json();
        return data.choices[0].text;
    };

    const enableChat = () => {
        chatInput.disabled = false;
        sendMessageBtn.disabled = false;
    };

    const sendMessage = async () => {
        const userMessage = chatInput.value;
        if (!userMessage) return;

        chatHistory.push({ sender: 'user', text: userMessage });
        localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
        renderChat();

        chatInput.value = '';
        sendMessageBtn.disabled = true;

        try {
            const aiResponse = await processContentWithOpenAI(userMessage);
            chatHistory.push({ sender: 'ai', text: aiResponse });
            localStorage.setItem('chatHistory', JSON.stringify(chatHistory));
            renderChat();
        } catch (error) {
            console.error('Error sending message:', error);
        } finally {
            sendMessageBtn.disabled = false;
        }
    };

    addUrlBtn.addEventListener('click', () => addUrl(urlInput.value));
    sendMessageBtn.addEventListener('click', sendMessage);
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
        } finally {
            initialStatus.style.display = 'none';
        }
    });

    renderUrls();
    renderChat();
});
