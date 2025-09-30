# Moondream Auto-Labeler

Auto-label images with bounding boxes using Moondream's query and detect API.

![Auto-labeling example](auto_label_example.gif)

## Setup

**Prerequisites**: You need a Moondream API key from [moondream.ai](https://moondream.ai)

### Option 1: Set API key then start server
```bash
export MOONDREAM_API_KEY="your_api_key_here"
npm start
```

### Option 2: Set API key inline with server start
```bash
MOONDREAM_API_KEY="your_api_key_here" npm start
```

### Option 3: Use node directly
```bash
MOONDREAM_API_KEY="your_api_key_here" node server.js
```

## Quick Start

1. **Set your API key and start the server** (see Setup above)

2. **Open** http://localhost:3002

3. **Upload images** - drag & drop single images, multiple images, or entire folders

4. **Enter a prompt** (optional) - describe what to find, or leave blank to detect everything

5. **Click ✨ Auto-label** and view results with bounding boxes

## Features


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