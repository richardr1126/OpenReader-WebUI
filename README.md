# OpenReader WebUI

OpenReader WebUI is a modern, user-friendly web interface for reading and analyzing PDF documents. Built with Next.js and React, it provides an intuitive interface for document viewing, analysis, and interaction. The application features drop-in support for any OpenAI-compatible Text-to-Speech (TTS) API, making it highly flexible for various voice synthesis implementations.

## Demo


https://github.com/user-attachments/assets/7a3457ba-feda-4939-928a-cb587b1c0884


## Features

- PDF document viewing and navigation
- Interactive document interface
- Modern UI with Tailwind CSS
- Fast performance with Next.js and Turbopack
- PDF text analysis capabilities
- Drop-in support for OpenAI-compatible TTS APIs
- Responsive design for various screen sizes

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/)
- **UI Library**: [React 19](https://react.dev/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **PDF Processing**: [React-PDF](https://react-pdf.org/) and [PDF.js](https://mozilla.github.io/pdf.js/)
- **UI Components**: [Headless UI](https://headlessui.com/)
- **Type Safety**: [TypeScript](https://www.typescriptlang.org/)

## Prerequisites

- Node.js 18.x or higher
- npm or yarn package manager

## Getting Started

1. Clone the repository:
```bash
git clone [repository-url]
cd OpenReader-WebUI
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Set up environment variables:
```bash
cp .env.template .env
```
Edit the `.env` file with your configuration settings.

4. Start the development server:
```bash
npm run dev
# or
yarn dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

## Available Scripts

- `npm run dev` - Start development server with Turbopack
- `npm run build` - Create production build
- `npm run start` - Start production server
- `npm run lint` - Run ESLint for code quality

## Project Structure

```
openreader-webui/
├── src/
│   ├── app/          # Next.js app router pages
│   ├── components/   # Reusable React components
│   ├── contexts/     # React context providers
│   └── services/     # Business logic and services
├── public/           # Static assets
└── scripts/         # Utility scripts
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the terms of the license included in the repository.

---

Built with ❤️ using [Next.js](https://nextjs.org/)
