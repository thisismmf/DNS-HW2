FROM node@sha256:cbe2d5f94110cea9817dd8c5809d05df49b4bd1aac5203f3594d88665ad37988

RUN useradd -m user

RUN apt -y update
RUN apt -y install socat

WORKDIR /app

COPY ./index.js .
COPY ./recipes /app/recipes
RUN chown -R root:root /app
RUN chmod -R 555 /app/
RUN chmod 777 /app/recipes
RUN chmod 444 /app/recipes/*.txt

CMD ["socat", "TCP-LISTEN:5000,reuseaddr,fork", "EXEC:'su user -c ./index.js'"]
