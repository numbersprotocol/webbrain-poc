# WebBrain Proof of Concept

## Project Description and Overview

WebBrain is a tool that transforms any website into a customized AI. This proof of concept (POC) demonstrates the core functionality of extracting website content, processing it through an AI model, and enabling users to chat with an AI that has knowledge of the website content.

## Instructions for Running the Application

1. Clone the repository:
   ```
   git clone https://github.com/numbersprotocol/webbrain-poc.git
   cd webbrain-poc
   ```

2. Open `index.html` in your web browser to run the application.

## Development Instructions

When contributing to this POC, please follow these guidelines:

1. **Single Page Application**: Keep the application as a single page without a backend. If server-side functionality is needed, use serverless functions (like AWS Lambda or Netlify Functions) instead.

2. **Problem-Solving Approach**: Always try to fix issues directly. If a solution would require significant architectural changes, it's acceptable to use mockup data temporarily, but keep mockups minimal and document them clearly.

3. **Keep It Simple**: Focus on minimal and clean implementations. Scalability is not a primary concern at this POC stage - prioritize functionality and clear code over complex optimizations.

## Technology Stack

- **Frontend**: Vanilla JavaScript
- **Styling**: CSS with variables for theming
- **APIs**: OpenAI API for AI processing
- **Deployment**: Static site (can be hosted on Gitbook)
