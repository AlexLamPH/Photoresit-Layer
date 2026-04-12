# Privacy Policy — Photoresist Layer

**Last updated**: April 11, 2026
**Developer**: Cosmos AI Lab (Alex Pham)

## Overview

Photoresist Layer is a Chrome extension that allows users to annotate websites and create visual feedback bundles for AI coding tools. We respect your privacy and are committed to protecting your personal data.

## Data Collection

### What we collect
- **Annotations**: Pins, notes, drawings, and shapes you create on websites (only when you actively use the extension)
- **Screenshots**: Screen captures you manually take using the extension's capture tool
- **Page metadata**: URL, page title, viewport size, and DOM element information at annotation points
- **Device info**: Browser type, OS, and viewport dimensions (auto-detected, not personally identifiable)

### What we DO NOT collect
- Browsing history
- Personal information (name, email, passwords)
- Data from websites you visit without activating the extension
- Cookies or login credentials
- Keystrokes or form input data

## Data Storage

- **Local storage**: Screenshots and exported files are stored in your browser's local storage (chrome.storage)
- **Firebase Cloud** (optional): When you click "Send", feedback bundles are uploaded to Firebase (Firestore + Google Cloud Storage) using anonymous authentication
- **Local Bridge** (optional): If you run the local bridge server, bundles are saved to `~/Photoresist/outbox/` on your machine

## Data Sharing

- We do **NOT** share, sell, or transfer your data to third parties
- Feedback bundles are only accessible to you and the AI tools you choose to connect via MCP
- Firebase data is stored in your own Firebase project (configurable)

## Permissions

| Permission | Why we need it |
|-----------|---------------|
| `activeTab` | To capture screenshots and inject the annotation overlay |
| `storage` | To save your screenshots and settings locally |
| `host_permissions (all URLs)` | To allow the extension to work on any website you choose |

## User Control

- You can delete any screenshot or exported file from the Library at any time
- You can disconnect Firebase by removing your `.env.local` configuration
- Uninstalling the extension removes all local data

## Open Source

Photoresist Layer is open source. You can review the full source code at:
https://github.com/cosmosailab/photoresist-layer

## Contact

For privacy questions or concerns:
- **Developer**: Cosmos AI Lab
- **Founder**: Alex Pham
- **Location**: Ho Chi Minh City, Vietnam

## Changes

We may update this privacy policy from time to time. Changes will be posted in the extension's repository.
