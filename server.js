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

// Disable caching for development
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

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
    console.log('User prompt:', prompt || '(no prompt - finding all objects)');
    console.log('Step 1: Getting object list...');

    // Step 1: Query for objects
    let objectPrompt;
    if (prompt.trim()) {
      // Handle compound requests better
      const cleanPrompt = prompt.trim();
      if (cleanPrompt.includes(' and ') || cleanPrompt.includes(', ')) {
        // For compound requests, use more inclusive language
        objectPrompt = `Look at this image and identify all ${cleanPrompt} that you can see. List each item you find as a simple comma-separated list of the object and type. Include both types of objects mentioned. If you cannot find any relevant objects, return exactly "null".`;
      } else {
        // Single object type - use original format
        objectPrompt = `List all ${cleanPrompt} you can see in this image. Return your answer as a simple comma-separated list of object names and their type. For example "red car" or "sign up button". If you cannot find any ${cleanPrompt}, return exactly "null".`;
      }
    } else {
      objectPrompt = `List all the objects you can see in this image. Return your answer as a simple comma-separated list of object names. Look carefully and include anything you can identify.`;
    }
    
    console.log('Full prompt sent to Moondream:', objectPrompt);

    const queryPayload = {
      image_url: image,
      question: objectPrompt,
      reasoning: true  // Enable grounded reasoning for better accuracy
    };
    console.log('Request payload:', { 
      image_url: image.substring(0, 50) + '...', 
      question: objectPrompt 
    });

    const queryResponse = await fetch("https://api.moondream.ai/v1/query", {
      method: "POST",
      headers: {
        "X-Moondream-Auth": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(queryPayload),
    });

    if (!queryResponse.ok) {
      throw new Error(`Moondream query failed: ${queryResponse.status}`);
    }

    const queryResult = await queryResponse.json();
    const objectList = queryResult.answer || '';
    
    console.log('Step 1 response:', objectList);

    // Parse objects from comma-separated list
    let objects = [];
    
    // Check if response is null or indicates no objects
    if (objectList.toLowerCase().trim() === 'null' || objectList.toLowerCase().includes('no ') || objectList.toLowerCase().includes('none')) {
      objects = [];
    } else {
      objects = objectList
        .split(',')
        .map(obj => obj.trim())
        .filter(obj => obj.length > 0);
    }

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
    let globalIndex = 0; // Track global index for consistent coloring
    
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
            reasoning: true  // Enable grounded reasoning for detection
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
                y_max: obj.y_max,
                originalIndex: globalIndex // Preserve original color index
              });
              globalIndex++;
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