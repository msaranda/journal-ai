#!/bin/bash

# Install Whisper for local STT processing
# This script installs OpenAI Whisper CLI for high-quality local speech recognition

echo "🎤 Installing OpenAI Whisper for local STT..."

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed."
    echo "Please install Python 3 first: https://www.python.org/downloads/"
    exit 1
fi

# Check if pip is available
if ! command -v pip3 &> /dev/null; then
    echo "❌ pip3 is required but not installed."
    echo "Please install pip3 first."
    exit 1
fi

echo "✅ Python 3 and pip3 found"

# Install Whisper
echo "📦 Installing OpenAI Whisper..."
pip3 install openai-whisper

# Verify installation
if command -v whisper &> /dev/null; then
    echo "✅ Whisper installed successfully!"
    echo "🔍 Testing Whisper installation..."
    
    # Download base model (this will happen on first use anyway)
    echo "📥 Downloading base model (this may take a few minutes)..."
    whisper --help > /dev/null 2>&1
    
    echo ""
    echo "🎉 Whisper is ready to use!"
    echo ""
    echo "📋 Next steps:"
    echo "1. In your journal app settings, set STT Engine to 'local'"
    echo "2. Try dictation - it will use high-quality local Whisper processing"
    echo "3. Your speech data stays completely private on your machine"
    echo ""
    echo "💡 Tip: The first time you use each language, Whisper will download"
    echo "   the language model. This is a one-time download per language."
    
else
    echo "❌ Whisper installation failed"
    echo "Please try installing manually: pip3 install openai-whisper"
    exit 1
fi
