# Use Node.js slim image
FROM node:current-alpine

# Add ffmpeg and libreoffice using Alpine package manager
RUN apk add --no-cache ffmpeg libreoffice-writer

# Install pnpm globally
RUN npm install -g pnpm

# Create app directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy project files
COPY . .

# Build the Next.js application
RUN pnpm exec next telemetry disable
RUN pnpm build

# Expose the port the app runs on
EXPOSE 3003

# Start the application
CMD ["pnpm", "start"]