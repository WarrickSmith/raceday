# FROM node:16
# WORKDIR /app
# ENV CHOKIDAR_USEPOLLING=true
# COPY package*.json /app/
# RUN ["npm", "install"]
# RUN npm run build
# ENV NODE_ENV production
# COPY . /app
# EXPOSE 3000
# CMD [ "npx", "serve", "build" ]
# ENTRYPOINT [ "npm","start" ]

# Use an official Node runtime as a parent image
FROM node:16-alpine

# Set the working directory to /app
WORKDIR /app
ENV CHOKIDAR_USEPOLLING=true
# Copy package.json and package-lock.json to /app
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code to /app
COPY . .

# Build the application
RUN npm run build

# Set the environment variable to production
ENV NODE_ENV=production

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["npm", "start"]