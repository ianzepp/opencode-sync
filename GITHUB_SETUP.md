# GitHub Repository Setup Guide

This document explains how to set up the GitHub repository for the opencode-sync project to enable CURL installation and automated releases.

## Repository Structure

```
ianzepp/opencode-sync/
├── .github/
│   └── workflows/
│       ├── ci.yml              # Continuous integration
│       └── release.yml         # Automated releases
├── src/                        # TypeScript source code
├── dist/                       # Compiled JavaScript
├── install.sh                  # CURL installation script
├── package.json                # NPM package configuration
├── README.md                   # Project documentation
└── GITHUB_SETUP.md             # This file
```

## Setup Steps

### 1. Create GitHub Repository
1. Go to https://github.com/new
2. Repository name: `opencode-sync`
3. Description: "Sync OpenCode conversations between machines using shared directories"
4. Make it public (for free CI/CD)
5. Initialize with README: No (we already have one)
6. Add .gitignore: No (we already have one)
7. Choose a license: MIT (we already have one)

### 2. Update Repository URLs
Replace `ianzepp` with your actual GitHub username in these files:

- `install.sh` (line with git clone URL)
- `README.md` (CURL installation URL and badges)
- `QUICKSTART.md` (CURL installation URL)
- `package.json` (repository, bugs, homepage URLs)
- `.github/workflows/*.yml` (repository references)

### 3. NPM Publishing Setup (Optional)
If you want to publish to NPM:

1. Create an NPM account at https://www.npmjs.com/
2. Create an NPM token at https://www.npmjs.com/settings/ianzepp/tokens
3. Add the token to GitHub Secrets:
   - Go to repository Settings → Secrets and variables → Actions
   - Add secret: `NPM_TOKEN` with your token value

### 4. Update Package Information
Edit `package.json` with your information:
```json
{
  "author": "Your Name <your.email@example.com>",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/ianzepp/opencode-sync.git"
  },
  "bugs": {
    "url": "https://github.com/ianzepp/opencode-sync/issues"
  },
  "homepage": "https://github.com/ianzepp/opencode-sync#readme"
}
```

### 5. Prepare for Publishing
Use the preparation script before publishing:
```bash
./.github/workflows/prepare-package.sh
```

This script will update package.json for NPM publishing.

## Installation Methods

Once set up, users can install via:

### 1. CURL Installation (Recommended)
```bash
curl -fsSL https://raw.githubusercontent.com/ianzepp/opencode-sync/main/install.sh | bash
```

### 2. NPM Installation
```bash
npm install -g opencode-sync
```

### 3. Bun Installation
```bash
bun install -g opencode-sync
```

## Automated Workflows

### CI/CD Pipeline
The repository includes GitHub Actions workflows:

- **CI Workflow** (`.github/workflows/ci.yml`):
  - Runs on every push to main/dev branches
  - Tests on multiple OS (Ubuntu, macOS, Windows)
  - Tests on multiple Node.js versions (16, 18, 20)
  - Runs linting and type checking

- **Release Workflow** (`.github/workflows/release.yml`):
  - Triggered on version tags (e.g., `v1.0.0`)
  - Automatically publishes to NPM
  - Creates GitHub releases
  - Updates installation URLs

### Creating a Release
1. Update version in `package.json`
2. Commit and push changes
3. Create and push a tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
4. GitHub Actions will automatically:
   - Run tests
   - Publish to NPM
   - Create GitHub release

## Testing the Installation

After setting up, test the CURL installation:
```bash
# Test the install script locally
./install.sh --help

# Simulate CURL installation
curl -fsSL https://raw.githubusercontent.com/ianzepp/opencode-sync/main/install.sh | bash
```

## Repository Badges

Add these badges to your README (already included):

```markdown
[![CI](https://github.com/ianzepp/opencode-sync/workflows/CI/badge.svg)](https://github.com/ianzepp/opencode-sync/actions)
[![Release](https://github.com/ianzepp/opencode-sync/workflows/Release/badge.svg)](https://github.com/ianzepp/opencode-sync/releases)
[![npm version](https://badge.fury.io/js/opencode-sync.svg)](https://badge.fury.io/js/opencode-sync)
```

## Maintenance

### Regular Updates
- Keep dependencies updated
- Monitor GitHub Actions for failures
- Respond to issues and pull requests
- Update documentation as needed

### Security
- Keep GitHub Actions updated
- Use Dependabot for dependency updates
- Regularly review and rotate NPM tokens
- Monitor for security advisories

## Support

For issues related to:
- **Installation**: Check the install script and environment variables
- **GitHub Actions**: Check the Actions tab in your repository
- **NPM Publishing**: Check NPM token and package.json configuration
- **General usage**: See README.md and QUICKSTART.md

## Next Steps

1. ✅ Create GitHub repository
2. ✅ Update all URLs with your username
3. ✅ Set up NPM publishing (optional)
4. ✅ Test CURL installation
5. ✅ Create your first release
6. ✅ Share with the OpenCode community!

---

**Note**: This project is ready for GitHub! Just replace `ianzepp` with your actual GitHub username throughout the codebase and you're good to go! 🚀