FROM node:16
WORKDIR /app
ENV CHOKIDAR_USEPOLLING=true
COPY . /app
EXPOSE 3000
RUN ["npm","install"]
ENTRYPOINT [ "npm","start" ]
