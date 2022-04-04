FROM node:16
WORKDIR /app
ENV CHOKIDAR_USEPOLLING=true
COPY package*.json /app/
COPY . /app
RUN ["npm","install"]
EXPOSE 3000
ENTRYPOINT [ "npm","start" ]
