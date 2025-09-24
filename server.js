import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3002;

// Middleware - simple CORS headers instead of cors package
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

// Auto-label endpoint that combines /query and /detect
app.post('/auto-label', async (req, res) => {
  try {
    const { image, prompt = '' } = req.body;

    if (!image) {
      return res.status(400).json({ error: 'Image is required' });
    }

    // Get Moondream API key from environment
    const apiKey = process.env.MOONDREAM_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'MOONDREAM_API_KEY not configured' });
    }

    console.log('=== MOONDREAM AUTO-LABELER ===');
    console.log('Step 1: Getting object list...');

    // Step 1: Query for objects
    const objectPrompt = prompt.trim() 
      ? `List the ${prompt.trim()} you can see in this image. Return your answer as a simple comma-separated list of object names.`
      : `List the objects you can see in this image. Return your answer as a simple comma-separated list of object names.`;

    const queryResponse = await fetch("https://api.moondream.ai/v1/query", {
      method: "POST",
      headers: {
        "X-Moondream-Auth": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image_url: image,
        question: objectPrompt,
      }),
    });

    if (!queryResponse.ok) {
      throw new Error(`Moondream query failed: ${queryResponse.status}`);
    }

    const queryResult = await queryResponse.json();
    const objectList = queryResult.answer || '';
    
    console.log('Step 1 response:', objectList);

    // Parse objects from comma-separated list
    const objects = objectList
      .split(',')
      .map(obj => obj.trim())
      .filter(obj => obj.length > 0);

    console.log('Discovered objects:', objects);

    if (objects.length === 0) {
      return res.json({
        objects: [],
        originalImage: image,
        message: 'No objects found'
      });
    }

    console.log('Step 2: Detecting objects...');

    // Step 2: Detect each object
    const detectionResults = [];
    
    for (const objectName of objects) {
      try {
        const detectResponse = await fetch("https://api.moondream.ai/v1/detect", {
          method: "POST",
          headers: {
            "X-Moondream-Auth": apiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_url: image,
            object: objectName,
          }),
        });

        if (detectResponse.ok) {
          const detectResult = await detectResponse.json();
          if (detectResult.objects && detectResult.objects.length > 0) {
            detectResult.objects.forEach(obj => {
              detectionResults.push({
                label: objectName,
                x_min: obj.x_min,
                y_min: obj.y_min,
                x_max: obj.x_max,
                y_max: obj.y_max
              });
            });
          }
        } else {
          console.warn(`Detection failed for ${objectName}:`, detectResponse.status);
        }
      } catch (error) {
        console.warn(`Detection error for ${objectName}:`, error.message);
      }
    }

    console.log(`Found ${detectionResults.length} bounding boxes`);

    res.json({
      objects: detectionResults,
      originalImage: image,
      discoveredObjects: objects
    });

  } catch (error) {
    console.error('Auto-label error:', error);
    res.status(500).json({ error: 'Auto-labeling failed: ' + error.message });
  }
});

// Serve the HTML file
app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Moondream Auto-Labeler running on http://0.0.0.0:${PORT}`);
  console.log('Make sure MOONDREAM_API_KEY environment variable is set');
});