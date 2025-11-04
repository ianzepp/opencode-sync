#!/bin/bash

# OpenCode Sync Installation Script
# Supports installation via CURL: curl -fsSL https://raw.githubusercontent.com/ianzepp/opencode-sync/main/install.sh | bash

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🔄 OpenCode Sync Installation${NC}"
echo -e "${BLUE}══════════════════════════════${NC}"

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Detect OS and architecture
detect_system() {
    OS=$(uname -s | tr '[:upper:]' '[:lower:]')
    ARCH=$(uname -m)
    
    case $OS in
        linux)
            PLATFORM="linux"
            ;;
        darwin)
            PLATFORM="macos"
            ;;
        *)
            print_error "Unsupported operating system: $OS"
            exit 1
            ;;
    esac
    
    case $ARCH in
        x86_64|amd64)
            ARCH="x64"
            ;;
        arm64|aarch64)
            ARCH="arm64"
            ;;
        *)
            print_error "Unsupported architecture: $ARCH"
            exit 1
            ;;
    esac
}

# Check if Node.js is available
check_runtime() {
    if command -v npm &> /dev/null; then
        print_status "Found npm"
        RUNTIME="npm"
        INSTALL_CMD="npm install"
        BUILD_CMD="npm run build"
        LINK_CMD="npm link"
    else
        print_error "npm not found. Please install Node.js first."
        echo ""
        echo "Install Node.js: https://nodejs.org/"
        exit 1
    fi
}

# Installation methods
install_from_source() {
    echo -e "\n${BLUE}📦 Installing from source...${NC}"
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Clone repository
    echo "Cloning repository..."
    git clone https://github.com/ianzepp/opencode-sync.git . || {
        print_error "Failed to clone repository"
        exit 1
    }
    
    # Install dependencies
    echo "Installing dependencies..."
    $INSTALL_CMD || {
        print_error "Failed to install dependencies"
        exit 1
    }
    
    # Build project
    echo "Building project..."
    $BUILD_CMD || {
        print_error "Failed to build project"
        exit 1
    }
    
    # Global installation
    echo "Installing globally..."
    $LINK_CMD || {
        print_error "Failed to install globally. You may need to run: sudo npm link"
        exit 1
    }
    
    # Cleanup
    cd - > /dev/null
    rm -rf "$TEMP_DIR"
}

install_from_npm() {
    echo -e "\n${BLUE}📦 Installing from npm...${NC}"
    
    npm install -g opencode-sync || {
        print_error "Failed to install from npm"
        exit 1
    }
}

# Verify installation
verify_installation() {
    if command -v opencode-sync &> /dev/null; then
        print_status "Installation successful!"
        
        # Test the installation
        if opencode-sync --version &> /dev/null; then
            VERSION=$(opencode-sync --version 2>&1 | head -n1)
            print_status "Installed version: $VERSION"
        fi
        
        return 0
    else
        print_error "Installation failed. opencode-sync command not found."
        return 1
    fi
}

# Show post-installation instructions
show_post_install() {
    echo -e "\n${BLUE}🎉 Next steps:${NC}"
    echo ""
    echo "1. Set environment variables:"
    echo -e "   ${YELLOW}export OPENCODE_STORAGE_DIR=\"\$HOME/.local/share/opencode/storage\"${NC}"
    echo -e "   ${YELLOW}export OPENCODE_SYNC_DIR=\"/path/to/your/sync/directory\"${NC}"
    echo ""
    echo "2. Test the installation:"
    echo -e "   ${YELLOW}opencode-sync --help${NC}"
    echo ""
    echo "3. Check sync status:"
    echo -e "   ${YELLOW}opencode-sync check${NC}"
    echo ""
    echo -e "${BLUE}📖 For more information, see:${NC}"
    echo -e "   ${YELLOW}https://github.com/ianzepp/opencode-sync${NC}"
}

# Main installation flow
main() {
    echo -e "\n${BLUE}Detecting system...${NC}"
    detect_system
    print_status "Detected: $PLATFORM $ARCH"
    
    echo -e "\n${BLUE}Checking runtime...${NC}"
    check_runtime
    
    # Check if we should install from npm or source
    if [ "$1" = "--from-npm" ]; then
        install_from_npm
    else
        install_from_source
    fi
    
    # Add npm global bin to PATH if not already there
    if ! command -v opencode-sync &> /dev/null; then
        NPM_GLOBAL_BIN=$(npm bin -g 2>/dev/null || echo "$HOME/.npm-global/bin")
        print_warning "opencode-sync not found in PATH. You may need to add the following to your shell profile:"
        echo -e "${YELLOW}export PATH=\"\$PATH:$NPM_GLOBAL_BIN\"${NC}"
        echo "Then restart your terminal or run: source ~/.bashrc (or ~/.zshrc)"
    fi
    
    echo -e "\n${BLUE}Verifying installation...${NC}"
    if verify_installation; then
        show_post_install
        echo -e "\n${GREEN}🎉 OpenCode Sync is ready to use!${NC}"
    else
        echo -e "\n${RED}❌ Installation failed.${NC}"
        exit 1
    fi
}

# Handle arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --from-npm)
            FROM_NPM=true
            shift
            ;;
        --help|-h)
            echo "OpenCode Sync Installation Script"
            echo ""
            echo "Usage: $0 [OPTIONS]"
            echo ""
            echo "Options:"
            echo "  --from-npm    Install from npm instead of source"
            echo "  --help, -h    Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                    # Install from source"
            echo "  $0 --from-npm         # Install from npm"
            echo ""
            echo "CURL Installation:"
            echo "  curl -fsSL https://raw.githubusercontent.com/ianzepp/opencode-sync/main/install.sh | bash"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Run main function
main "$@"