# Moondream Auto-Labeler

Auto-label images with AI-powered object detection using Moondream's vision API.

## Quick Start

1. **Start the server**
   ```bash
   node server.js
   ```

2. **Open** http://localhost:3002

3. **Upload images** - drag & drop single images, multiple images, or entire folders

4. **Enter a prompt** (optional) - describe what to find, or leave blank to detect everything

5. **Click Auto-Label** and view results with bounding boxes

## Features

- **Batch processing** - handle multiple images or folders at once
- **Individual filtering** - each result has its own filter pills to show/hide specific objects
- **Drag & drop** - supports files and folders
- **Clean interface** - minimal, focused design

## Setup

Set your Moondream API key as an environment variable:

```bash
export MOONDREAM_API_KEY=your_api_key_here
```

## How It Works

The auto-labeler uses a two-step process with Moondream's API:

1. **Query Endpoint** (`/v1/query`)
   - Sends your prompt, or if blank, uses the default: `"List the objects you can see in this image. Return your answer as a simple comma-separated list of object names."`
   - Custom prompt example: `"List the cars you can see in this image. Return your answer as a simple comma-separated list of object names."`
   - Returns a text response like: `"sedan, truck, motorcycle"`

2. **Detect Endpoint** (`/v1/detect`) 
   - For each object found in step 1, requests precise bounding box coordinates
   - Example: `{"object": "sedan"}` → Returns `{"objects": [{"x_min": 0.1, "y_min": 0.2, "x_max": 0.4, "y_max": 0.6}]}`
   - Coordinates are normalized (0-1) relative to image dimensions

This approach combines Moondream's natural language understanding with precise object localization.

## Todo
- Add label editing and manually adding new labels
- Ability to download as a dataset