<div align="center">
  <img src="logo.png" alt="Novon logo" width="120" />
  <h1>Novon Extensions</h1>
  <p>The official extension repository and developer SDK for the Novon ecosystem.</p>
  <p>
    <img alt="API Version" src="https://img.shields.io/badge/API-v1-6C63FF" />
    <img alt="Language" src="https://img.shields.io/badge/Language-JavaScript-F7DF1E" />
    <img alt="Status" src="https://img.shields.io/badge/Status-Alpha-orange" />
  </p>
</div>

## Table of Contents

- [Overview](#overview)
- [How to Create an Extension](#how-to-create-an-extension)
- [Project Structure](#project-structure)
- [Bundling & Automation](#bundling--automation)
- [Disclaimer](#disclaimer)
- [Authors & Maintainers](#authors--maintainers)
- [License](#license)

---

## Overview

> [!WARNING]
> **Educational & Testing Purpose Only**
>
> This repository is intended as a **technical demonstration and testing environment** for Novon extension development. The extensions provided here are examples and are **not recommended for use in the production Novon application**.
>
> For reliable and verified extensions, please refer to the official Novon extension channels.

This repository acts as a centralized registry for Novon extensions. It contains the source code for provider integrations and the automated infrastructure required to bundle them into `.novext` packages for the application.

## Getting Started with Development

> [!TIP]
> **Recommended Starting Point**
>
> We have provided a **Template Palette** (`com.novon.template`) that implements the full source interface. Use this as your foundation when building new extensions.

Before you begin, please review the [Source Script Technical Specification](https://novon.iprog.dev/docs/reference/source-script) for the exact Dart-JS contract requirements.

## How to Create an Extension

Creating a Novon extension involves defining a manifest, a source script, and an icon.

### 1. The Manifest (`manifest.json`)
The manifest defines the core metadata for your extension. It must match the following schema:

```json
{
  "id": "com.novon.mysource",
  "name": "My Source Name",
  "version": "1.0.0",
  "apiVersion": "1",
  "minAppVersion": "0.0.1",
  "lang": "en",
  "baseUrl": "https://source.com",
  "authorName": "MultiX0",
  "icon": "icon.png"
}
```

### 2. The Source Script (`source.js`)
The JS engine executes this script. It should define the logic for:
- Popular/Recent novel fetching
- Search results
- Novel details (description, status, chapters)
- Page fetching (content extraction)

### 3. The Icon (`icon.png`)
A square 128x128 or 256x256 PNG image representing the source.

## Project Structure

```text
extensions-example/
├── com.novon.kolnovel/      # Extension source directory
│   ├── manifest.json        # Extension metadata
│   ├── source.js            # Provider logic
│   └── icon.png             # Source icon
├── bundles/                 # Generated .novext packages
├── icons/                   # Synced icons for the index
├── index.json               # The global repo registry
└── bundle_extensions.py     # Automation & Bundling script
```

## Bundling & Automation

We use a Python-based automation pipeline to ensure every extension is correctly packaged, hashed, and synchronized with the registry.

### 1. Configure the Script
Open `bundle_extensions.py` and update the `CONFIGURATION` section at the top with your repository details:

```python
# --- CONFIGURATION ---
ORG_NAME = "novon-app"
REPO_NAME = "extensions"
BRANCH = "main"
REGISTRY_DISPLAY_NAME = "Novon Official Extensions"
# ---------------------
```

### 2. Run the Bundle Tool
To generate new bundles and update the `index.json` registry, run the script from the root of this repository:

```bash
python bundle_extensions.py
```

### What the script does automatically:
1. **Discovery**: Automatically identifies all extension directories starting with `com.novon.*`.
2. **Script Integrity**: Calculates the SHA-256 hash of `source.js` and injects it into the local `manifest.json`.
3. **Packaging**: Compresses each extension directory into a `.novext` (ZIP) bundle.
4. **Bundle Integrity**: Computes a SHA-256 hash of the final bundle for download verification.
5. **Synchronization**: Updates the global `index.json` with new versions, hashes, and raw GitHub download URLs.

> [!NOTE]
> Ensure you increment the `version` field in your `manifest.json` before running the bundling script, otherwise the registry will not detect the update as a new release.

## Disclaimer

> [!CAUTION]
> **Legal Disclaimer**
>
> This repository and its maintainers do not host, mirror, or distribute any novel content. The extensions provided here are simply tools (parsers) that allow users to access content from third-party websites through the Novon application.
>
> By using these extensions, you acknowledge that:
> 1. You are responsible for the content you access.
> 2. You must comply with the Terms of Service of the respective third-party providers.
> 3. The maintainers of this repository are not affiliated with, nor do they endorse, any content found on the provider websites.
>
> Use of these extensions is at your own risk.

## Authors & Maintainers

- **MultiX0** — Lead Developer & Maintainer

## License

Licensed under the Apache License 2.0. See [LICENSE](LICENSE) for full details.
