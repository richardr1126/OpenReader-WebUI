# OpenReader WebUI

A web-based document reader with AI-powered text-to-speech functionality, supporting both PDF and EPUB formats.

## Features

- 📱 Responsive design for all devices
- 📚 Support for both PDF and EPUB documents
- 🔊 AI-powered text-to-speech with multiple provider options
- 📁 Document organization with folders
- 🌓 Light and dark themes
- 🔄 Adjustable reading speed

## 🆕 Multiple AI Provider Support

OpenReader now supports multiple AI providers for text-to-speech:

- **OpenAI** - High-quality TTS using GPT models
- **OpenRouter** - API gateway to various AI models
- **Ollama** - Local AI model support
- **ElevenLabs** - Premium voice synthesis with natural-sounding voices

## Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `template.env` to `.env.local` and fill in your API keys
4. Start the development server: `npm run dev`

### Provider Configuration

Configure your preferred AI providers in `.env.local` or through the settings panel:

#### OpenAI (Default)
```
OPENAI_API_KEY=your_openai_key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=tts-1
```

#### OpenRouter
```
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openai/whisper
```

#### Ollama (Local)
```
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3:8b
```

#### ElevenLabs Voice Provider
```
ELEVENLABS_API_KEY=your_elevenlabs_key
```

## Voice Selection

OpenReader provides a user interface for selecting and managing voices:

- Choose between OpenAI or ElevenLabs voice providers
- Select from available voices for each provider
- Custom voice support with ElevenLabs (requires ElevenLabs subscription)
- Voice preferences are saved per document

## Development

- Built with Next.js 14
- TypeScript for type safety
- Tailwind CSS for styling
- Headless UI for accessible components

## Docker Deployment

Build and run with Docker:

```bash
docker build -t openreader-webui .
docker run -p 3003:3003 -e OPENAI_API_KEY=your_key openreader-webui
```

## License

MIT
