# Test Repositories for Meta Policy Scanner

## Official Meta SDKs (Always Current)
- https://github.com/facebook/facebook-nodejs-business-sdk
- https://github.com/facebook/facebook-python-business-sdk
- https://github.com/WhatsApp/WhatsApp-Nodejs-SDK

## WhatsApp (Most Active - Updated Dec 2025)
- https://github.com/pedroslopez/whatsapp-web.js - 20.4k stars, JS
- https://github.com/WhiskeySockets/Baileys - 7.3k stars, TS
- https://github.com/EvolutionAPI/evolution-api - 6.5k stars, TS
- https://github.com/wppconnect-team/wppconnect - 2.9k stars, TS
- https://github.com/Secreto31126/whatsapp-api-js - Official Cloud API wrapper, TS
- https://github.com/MarcosNicolau/whatsapp-business-sdk - Official Cloud API, TS

## Instagram (Updated 2024-2025)
- https://github.com/subzeroid/instagrapi - 5.7k stars, Python (July 2025)
- https://github.com/sns-sdks/python-facebook - Graph API wrapper, Python (Oct 2024)

## Messenger
- https://github.com/aiteq/messenger-bot - TS framework (Oct 2025)

## Quick Test Commands
```bash
# Large WhatsApp project (good for finding violations)
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/pedroslopez/whatsapp-web.js", "enableAI": true}'

# Official SDK (should be compliant)
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/facebook/facebook-nodejs-business-sdk", "enableAI": true}'

# Instagram private API (likely violations)
curl -X POST http://localhost:3001/api/scan \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com/subzeroid/instagrapi", "enableAI": true}'
```