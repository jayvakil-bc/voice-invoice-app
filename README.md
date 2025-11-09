# My Project

## Overview
This project is designed to provide a simple application with a clear entry point and corresponding unit tests. The main logic is contained in `src/index.js`, while `tests/index.test.js` ensures that the functionality works as expected.

## Project Structure
# Voice Invoice Generator

A modern web application that converts speech to professional PDF invoices.

## Features

- 🎤 Voice-to-text invoice generation
- 📄 Professional PDF output
- 📱 Fully responsive design
- ⚡ Real-time speech recognition
- 🤖 AI-powered data extraction

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file and add your OpenAI API key:
```
OPENAI_API_KEY=your_key_here
```

3. Run the server:
```bash
npm start
```

4. Open http://localhost:3000 in your browser

## Usage

1. Click the microphone button
2. Speak your invoice details (e.g., "Invoice from John's Design Studio to ABC Corp for website design, 10 hours at $100 per hour")
3. Click again to stop recording
4. Your PDF invoice will be automatically generated and downloaded

## Requirements

- Node.js 14+
- OpenAI API key
- Modern browser with speech recognition support (Chrome/Edge)

## Getting Your OpenAI API Key

1. Go to https://platform.openai.com/api-keys
2. Sign up or log in
3. Click "Create new secret key"
4. Copy the key and paste it in your `.env` file

## License
This project is licensed under the ISC License.

## Getting Started
To get started with this project, clone the repository and install the necessary dependencies.

```bash
git clone <repository-url>
cd my-project
npm install
```

## Running the Application
To run the application, use the following command:

```bash
node src/index.js
```

## Running Tests
To run the unit tests, use the following command:

```bash
npm test
```

## Contributing
Contributions are welcome! Please submit a pull request or open an issue for any enhancements or bug fixes.

## License
This project is licensed under the MIT License.