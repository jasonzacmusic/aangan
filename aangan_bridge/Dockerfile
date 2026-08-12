FROM ghcr.io/home-assistant/base:latest

ARG BUILD_VERSION
ARG BUILD_ARCH

LABEL \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

RUN apk add --no-cache python3

COPY run.sh /run.sh
COPY studio_wrapper.py /app/studio_wrapper.py
COPY web /app/web

RUN chmod a+x /run.sh /app/studio_wrapper.py

CMD ["/run.sh"]
