# Use Node.js slim image
FROM node:current-alpine

# Add ffmpeg using Alpine package manager
RUN apk add --no-cache ffmpeg

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy project files
COPY . .

# Install TypeScript globally for builds
RUN npm install -g typescript

# Build the Next.js application with extra memory allocation to handle larger builds
ENV NODE_OPTIONS="--max-old-space-size=4096"
RUN npm run build

# Expose the port the app runs on
EXPOSE 3003

# Start the application
CMD ["npm", "start"]