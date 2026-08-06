const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const { OAuth2Client } = require('google-auth-library');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { spawn } = require('child_process');
const OpenAI = require('openai');
const fs = require('fs');
const https = require('https');
require('dotenv').config();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Google OAuth client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'demo-client-id';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:5000',
      'http://127.0.0.1:5000',
      /https:\/\/.*\.replit\.app$/,
      /https:\/\/.*\.replit\.dev$/
    ];

    // Check if origin is allowed
    const isAllowed = allowedOrigins.some(pattern => {
      if (typeof pattern === 'string') {
        return pattern === origin;
      }
      return pattern.test(origin);
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for development
    }
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(express.static('.'));

// Configure multer for PDF uploads with absolute path
const upload = multer({
  dest: uploadsDir,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// In-memory user sessions (in production this would use database/Redis)
const userSessions = new Map();
const users = new Map();

// Authentication middleware
function requireAuth(req, res, next) {
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;

  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  req.user = user;
  next();
}

// Helper function to create user session
function createUserSession(user) {
  const sessionId = uuidv4();
  userSessions.set(sessionId, user);
  return sessionId;
}

// In-memory storage for the demo (for simplicity)
let currentSession = null;
let blockedSites = [
  { id: 1, url: 'facebook.com', category: 'social_media', isActive: true },
  { id: 2, url: 'twitter.com', category: 'social_media', isActive: true },
  { id: 3, url: 'youtube.com', category: 'entertainment', isActive: true },
  { id: 4, url: 'reddit.com', category: 'social_media', isActive: true }
];
let whitelistSites = [
  { id: 1, url: 'github.com', category: 'work', isActive: true },
  { id: 2, url: 'stackoverflow.com', category: 'work', isActive: true },
  { id: 3, url: 'docs.google.com', category: 'work', isActive: true }
];
let schedules = [
  { id: 1, name: 'Deep Work Morning', dayOfWeek: 1, startTime: '09:00', endTime: '12:00', isActive: true, blockingType: 'blacklist' },
  { id: 2, name: 'Focus Afternoon', dayOfWeek: 2, startTime: '14:00', endTime: '17:00', isActive: true, blockingType: 'whitelist' }
];
let pomodoroSessions = [];
let tasks = [
  { id: 1, title: 'Review project proposal', description: 'Go through the quarterly project proposal document', timeSlot: '09:00-10:00', priority: 'high', completed: false, isActive: true, createdAt: new Date() },
  { id: 2, title: 'Team standup meeting', description: 'Daily team synchronization', timeSlot: '10:30-11:00', priority: 'medium', completed: false, isActive: true, createdAt: new Date() }
];
let nudges = [
  { id: 1, type: 'focus_reminder', message: 'Time for a focused work session!', isRead: false, createdAt: new Date() },
  { id: 2, type: 'break_reminder', message: 'Take a 5-minute break to recharge.', isRead: false, createdAt: new Date() }
];

// Track daily stats
let dailyStats = {
  totalProductiveTime: 0, // in minutes
  totalDistractedTime: 0, // in minutes (pause time)
  sessionsCompleted: 0,
  lastResetDate: new Date().toDateString()
};

// Authentication Routes
app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;

    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;

    // Check if user exists, create if not
    let user = users.get(googleId);

    if (!user) {
      // Create new user
      user = {
        id: googleId,
        email: payload.email,
        firstName: payload.given_name,
        lastName: payload.family_name,
        profileImageUrl: payload.picture,
        createdAt: new Date(),
        lastLoginAt: new Date()
      };
      users.set(googleId, user);
    } else {
      // Update last login
      user.lastLoginAt = new Date();
    }

    // Create session
    const sessionId = createUserSession(user);

    // Set secure HTTP-only cookie
    res.cookie('sessionId', sessionId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    res.json(user);
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(400).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/auth/me', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;

  if (user) {
    res.json(user);
  } else {
    res.status(401).json({ error: 'Not authenticated' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.cookies.sessionId;

  if (sessionId) {
    userSessions.delete(sessionId);
  }

  res.clearCookie('sessionId');
  res.json({ success: true });
});

// API Routes

// Pomodoro Timer Routes
app.get('/api/pomodoro/current', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const userId = user ? user.id : 'demo-user';

  // Get user-specific session or demo session
  const userSession = user ? (user.currentSession || null) : currentSession;
  res.json(userSession);
});

app.post('/api/pomodoro/start', (req, res) => {
  const { duration, type } = req.body;
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const userId = user ? user.id : 'demo-user';

  // Initialize user data if not exists
  if (user && !user.dailyStats) {
    user.dailyStats = {
      totalProductiveTime: 0,
      totalDistractedTime: 0,
      sessionsCompleted: 0,
      lastResetDate: new Date().toDateString()
    };
    user.pomodoroSessions = [];
  }

  // Get user-specific stats or demo stats
  const userStats = user ? user.dailyStats : dailyStats;
  const userSessions = user ? user.pomodoroSessions : pomodoroSessions;

  // Reset daily stats if it's a new day
  const today = new Date().toDateString();
  if (userStats.lastResetDate !== today) {
    userStats.totalProductiveTime = 0;
    userStats.totalDistractedTime = 0;
    userStats.sessionsCompleted = 0;
    userStats.lastResetDate = today;
  }

  const newSession = {
    id: Date.now(),
    userId: userId,
    duration: duration || 25,
    type: type || 'work',
    startTime: new Date(),
    endTime: null,
    completed: false,
    timeRemaining: (duration || 25) * 60, // in seconds
    totalPauseTime: 0, // track total time paused
    lastPauseStart: null,
    actualWorkTime: 0 // actual focused time excluding pauses
  };

  // Set the session for the appropriate user
  if (user) {
    user.currentSession = newSession;
  } else {
    currentSession = newSession;
  }

  userSessions.push(newSession);
  res.json(newSession);
});

app.post('/api/pomodoro/pause', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const activeSession = user ? user.currentSession : currentSession;

  if (activeSession && !activeSession.lastPauseStart) {
    activeSession.lastPauseStart = new Date();
    res.json({ success: true, pausedAt: activeSession.lastPauseStart });
  } else {
    res.status(400).json({ error: 'No active session or already paused' });
  }
});

app.post('/api/pomodoro/resume', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const activeSession = user ? user.currentSession : currentSession;
  const userStats = user ? user.dailyStats : dailyStats;

  if (activeSession && activeSession.lastPauseStart) {
    const pauseDuration = (new Date() - activeSession.lastPauseStart) / 1000 / 60; // in minutes
    activeSession.totalPauseTime += pauseDuration;
    activeSession.lastPauseStart = null;
    userStats.totalDistractedTime += pauseDuration;
    res.json({ success: true, totalPauseTime: activeSession.totalPauseTime });
  } else {
    res.status(400).json({ error: 'No session to resume' });
  }
});

app.post('/api/pomodoro/complete', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const activeSession = user ? user.currentSession : currentSession;
  const userStats = user ? user.dailyStats : dailyStats;
  const userSessionsArray = user ? user.pomodoroSessions : pomodoroSessions;

  if (activeSession) {
    activeSession.endTime = new Date();
    activeSession.completed = true;
    activeSession.timeRemaining = 0;

    // Calculate actual work time (total duration minus pause time)
    activeSession.actualWorkTime = Math.max(0, activeSession.duration - activeSession.totalPauseTime);

    // Update daily stats
    userStats.totalProductiveTime += activeSession.actualWorkTime;
    userStats.sessionsCompleted += 1;

    // Update the session in the array
    const index = userSessionsArray.findIndex(s => s.id === activeSession.id);
    if (index !== -1) {
      userSessionsArray[index] = activeSession;
    }

    res.json(activeSession);

    // Clear current session
    if (user) {
      user.currentSession = null;
    } else {
      currentSession = null;
    }
  } else {
    res.status(400).json({ error: 'No active session' });
  }
});

app.post('/api/pomodoro/stop', (req, res) => {
  if (currentSession) {
    currentSession.endTime = new Date();
    currentSession.completed = false;

    // If there was an active pause, calculate final pause time
    if (currentSession.lastPauseStart) {
      const pauseDuration = (new Date() - currentSession.lastPauseStart) / 1000 / 60; // in minutes
      currentSession.totalPauseTime += pauseDuration;
      dailyStats.totalDistractedTime += pauseDuration;
      currentSession.lastPauseStart = null;
    }

    // Update the session in the array
    const index = pomodoroSessions.findIndex(s => s.id === currentSession.id);
    if (index !== -1) {
      pomodoroSessions[index] = currentSession;
    }

    res.json(currentSession);
    currentSession = null;
  } else {
    res.status(400).json({ error: 'No active session' });
  }
});

app.get('/api/pomodoro/history', (req, res) => {
  res.json(pomodoroSessions.slice(-10)); // Last 10 sessions
});

// White Noise API Routes (FlowBeats replaced with client-side generation)
app.get('/api/flowbeats/current', (req, res) => {
  // Return basic info since white noise is generated client-side
  res.json({
    success: true,
    message: 'White noise generated client-side',
    availableTypes: ['white', 'pink', 'rain', 'ocean', 'forest']
  });
});

// TaskPlanner Routes
app.get('/api/tasks', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const userTasks = user ? (user.tasks || tasks) : tasks;

  res.json(userTasks.filter(task => task.isActive));
});

app.post('/api/tasks', (req, res) => {
  const { title, description, timeSlot, priority } = req.body;
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;

  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  const newTask = {
    id: Date.now(),
    title,
    description: description || '',
    timeSlot: timeSlot || '',
    priority: priority || 'medium',
    completed: false,
    isActive: true,
    createdAt: new Date()
  };

  if (user) {
    if (!user.tasks) user.tasks = [];
    user.tasks.push(newTask);
  } else {
    tasks.push(newTask);
  }

  res.json(newTask);
});

app.put('/api/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const { completed, title, description, timeSlot, priority } = req.body;
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const userTasks = user ? (user.tasks || tasks) : tasks;

  const task = userTasks.find(task => task.id === id);
  if (task) {
    if (completed !== undefined) task.completed = completed;
    if (title !== undefined) task.title = title;
    if (description !== undefined) task.description = description;
    if (timeSlot !== undefined) task.timeSlot = timeSlot;
    if (priority !== undefined) task.priority = priority;

    res.json(task);
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

app.delete('/api/tasks/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const userTasks = user ? (user.tasks || tasks) : tasks;

  const task = userTasks.find(task => task.id === id);
  if (task) {
    task.isActive = false;
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Task not found' });
  }
});

// Usage Insights Routes
app.get('/api/insights', (req, res) => {
  const sessionId = req.cookies.sessionId;
  const user = sessionId ? userSessions.get(sessionId) : null;
  const userStats = user ? user.dailyStats : dailyStats;
  const activeSession = user ? user.currentSession : currentSession;
  const userBlockedSites = user ? (user.blockedSites || blockedSites) : blockedSites;

  // Initialize user data if not exists
  if (user && !user.dailyStats) {
    user.dailyStats = {
      totalProductiveTime: 0,
      totalDistractedTime: 0,
      sessionsCompleted: 0,
      lastResetDate: new Date().toDateString()
    };
  }

  // Reset daily stats if it's a new day
  const today = new Date().toDateString();
  if (userStats.lastResetDate !== today) {
    userStats.totalProductiveTime = 0;
    userStats.totalDistractedTime = 0;
    userStats.sessionsCompleted = 0;
    userStats.lastResetDate = today;
  }

  // Calculate focus score: focused time vs total time (focused + distracted)
  const totalTime = userStats.totalProductiveTime + userStats.totalDistractedTime;
  const focusScore = totalTime > 0 ? Math.round((userStats.totalProductiveTime / totalTime) * 100) : 0;

  const insights = {
    totalProductiveTime: Math.round(userStats.totalProductiveTime), // in minutes
    totalDistractedTime: Math.round(userStats.totalDistractedTime), // in minutes (pause time)
    pomodoroCount: userStats.sessionsCompleted,
    focusScore: focusScore,
    timeAway: Math.round(userStats.totalDistractedTime), // time paused
    currentSession: activeSession ? {
      totalPauseTime: Math.round(activeSession.totalPauseTime || 0),
      isPaused: !!activeSession.lastPauseStart
    } : null
  };

  res.json(insights);
});

// FocusFuel Routes
app.get('/api/focusfuel/quote', async (req, res) => {
  try {
    // In production, this would cache quotes and use a real API
    const fallbackQuotes = [
      { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
      { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
      { text: "It is during our darkest moments that we must focus to see the light.", author: "Aristotle" },
      { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
      { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
      { text: "The only impossible journey is the one you never begin.", author: "Tony Robbins" },
      { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
      { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
      { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
      { text: "Life is what happens to you while you're busy making other plans.", author: "John Lennon" }
    ];

    const randomQuote = fallbackQuotes[Math.floor(Math.random() * fallbackQuotes.length)];
    res.json(randomQuote);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch quote' });
  }
});

// SnapStudy Routes
app.post('/api/snapstudy/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No PDF file uploaded' });
    }

    const pdfPath = path.resolve(req.file.path);
    console.log('Processing PDF at path:', pdfPath);

    // Check if file exists
    if (!fs.existsSync(pdfPath)) {
      return res.status(500).json({
        success: false,
        error: `PDF file not found at path: ${pdfPath}`
      });
    }

    // Extract text from PDF using Python script
    const pythonScriptPath = path.join(__dirname, 'pdf_processor.py');

    // Try different Python commands for cross-platform compatibility
    let pythonCommand = 'python3';
    const pythonCommands = ['python', 'python3', 'py'];

    async function tryPythonCommand(cmd) {
      return new Promise((resolve) => {
        const testProcess = spawn(cmd, ['--version']);
        testProcess.on('close', (code) => resolve(code === 0));
        testProcess.on('error', () => resolve(false));
      });
    }

    // Find working Python command
    for (const cmd of pythonCommands) {
      if (await tryPythonCommand(cmd)) {
        pythonCommand = cmd;
        break;
      }
    }

    const pythonProcess = spawn(pythonCommand, [pythonScriptPath, pdfPath]);

    let textContent = '';
    let errorContent = '';

    pythonProcess.stdout.on('data', (data) => {
      textContent += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      errorContent += data.toString();
    });

    pythonProcess.on('close', (code) => {
      // Clean up uploaded file
      fs.unlink(pdfPath, (unlinkErr) => {
        if (unlinkErr) console.log('Warning: Could not delete uploaded file:', unlinkErr.message);
      });

      if (code !== 0) {
        console.log('Python process failed with code:', code);
        console.log('Error output:', errorContent);
        console.log('Trying JavaScript fallback for PDF processing...');

        // Use JavaScript fallback when Python fails
        const { extractTextFromPDF } = require('./pdf_fallback');
        const fallbackResult = extractTextFromPDF(pdfPath);

        if (fallbackResult.success) {
          return res.json({
            success: true,
            textContent: fallbackResult.text_content,
            message: 'PDF processed using JavaScript fallback method'
          });
        } else {
          return res.status(500).json({
            success: false,
            error: 'Both Python and JavaScript PDF processing failed: ' + fallbackResult.error
          });
        }
      }

      try {
        const result = JSON.parse(textContent);
        if (result.success) {
          res.json({
            success: true,
            textContent: result.text_content,
            message: 'PDF uploaded and processed successfully'
          });
        } else {
          res.status(500).json(result);
        }
      } catch (parseError) {
        console.log('Parse error:', parseError.message);
        console.log('Raw output:', textContent);
        res.status(500).json({
          success: false,
          error: 'Failed to parse PDF extraction result: ' + parseError.message
        });
      }
    });

    pythonProcess.on('error', (spawnError) => {
      console.log('Python spawn error:', spawnError.message);
      console.log('Using JavaScript fallback for PDF processing...');

      // Use JavaScript fallback when Python command fails to spawn
      const { extractTextFromPDF } = require('./pdf_fallback');
      const fallbackResult = extractTextFromPDF(pdfPath);

      // Clean up uploaded file
      fs.unlink(pdfPath, (unlinkErr) => {
        if (unlinkErr) console.log('Warning: Could not delete uploaded file:', unlinkErr.message);
      });

      if (fallbackResult.success) {
        res.json({
          success: true,
          textContent: fallbackResult.text_content,
          message: 'PDF processed using JavaScript fallback method'
        });
      } else {
        res.status(500).json({
          success: false,
          error: 'PDF processing failed: ' + fallbackResult.error
        });
      }
    });

  } catch (error) {
    console.log('Upload error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

// Fallback flashcard generator using text analysis
function generateFallbackFlashcards(textContent, count, difficulty) {
  const sentences = textContent.split(/[.!?]+/).filter(s => s.trim().length > 20);
  const flashcards = [];

  // Generate question-answer pairs based on text content
  for (let i = 0; i < Math.min(count, sentences.length); i++) {
    const sentence = sentences[i].trim();
    if (sentence.length > 30) {
      // Create questions based on sentence structure
      let question, answer;

      if (sentence.toLowerCase().includes('is defined as') || sentence.toLowerCase().includes('refers to')) {
        const parts = sentence.split(/is defined as|refers to/i);
        question = `What ${parts[0].trim()}?`;
        answer = parts[1] ? parts[1].trim() : sentence;
      } else if (sentence.toLowerCase().includes('because') || sentence.toLowerCase().includes('due to')) {
        const parts = sentence.split(/because|due to/i);
        question = `Why ${parts[0].trim()}?`;
        answer = `Because ${parts[1] ? parts[1].trim() : 'of the factors mentioned in the document'}`;
      } else {
        // Default question format
        const words = sentence.split(' ');
        if (words.length > 5) {
          question = `What does the document state about ${words.slice(0, 3).join(' ')}?`;
          answer = sentence;
        } else {
          question = `According to the document, what is mentioned about the content?`;
          answer = sentence;
        }
      }

      flashcards.push({
        id: i + 1,
        question: question,
        answer: answer,
        difficulty: difficulty
      });
    }
  }

  return flashcards;
}

app.post('/api/snapstudy/generate', async (req, res) => {
  try {
    const { textContent, count = 10, difficulty = 'medium' } = req.body;

    if (!textContent) {
      return res.status(400).json({
        success: false,
        error: 'No text content provided for flashcard generation'
      });
    }

    // Try AI generation first if API key is available
    if (process.env.GROQ_API_KEY) {
      try {
        // Generate flashcards using OpenAI
        const prompt = `Based on the following text content, generate exactly ${count} educational flashcards at ${difficulty} difficulty level.

Text content:
${textContent.substring(0, 3000)}

Please create flashcards that:
1. Focus on key concepts, facts, and important information
2. Are appropriate for ${difficulty} difficulty level
3. Have clear, concise questions and comprehensive answers
4. Cover different aspects of the material

Return the response in the following JSON format:
{
  "flashcards": [
    {
      "question": "Clear, specific question",
      "answer": "Comprehensive answer"
    }
  ]
}`;

        // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
        const response = await openai.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: "You are an expert educational content creator specializing in generating high-quality flashcards from academic material. Generate exactly the requested number of flashcards in valid JSON format."
            },
            {
              role: "user",
              content: prompt
            }
          ],
          response_format: { type: "json_object" },
          max_tokens: 2000
        });

        const result = JSON.parse(response.choices[0].message.content);

        if (!result.flashcards || !Array.isArray(result.flashcards)) {
          throw new Error('Invalid response format from AI');
        }

        const flashcards = result.flashcards.slice(0, count).map((card, index) => ({
          id: index + 1,
          question: card.question,
          answer: card.answer,
          difficulty: difficulty
        }));

        return res.json({
          success: true,
          flashcards: flashcards,
          count: flashcards.length,
          difficulty: difficulty,
          source: 'ai'
        });

      } catch (error) {
        console.error('AI flashcard generation failed, using fallback:', error.message);

        // Fall through to use fallback system
      }
    }

    // Use fallback text-based flashcard generation
    const fallbackFlashcards = generateFallbackFlashcards(textContent, count, difficulty);

    res.json({
      success: true,
      flashcards: fallbackFlashcards,
      count: fallbackFlashcards.length,
      difficulty: difficulty,
      source: 'text-analysis',
      message: 'Flashcards generated using text analysis (AI service unavailable)'
    });

  } catch (error) {
    console.error('Flashcard generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate flashcards: ' + error.message
    });
  }
});

// Task Management API Routes
app.get('/api/tasks', (req, res) => {
  const activeTasks = tasks.filter(task => task.isActive);
  res.json(activeTasks);
});

app.post('/api/tasks', (req, res) => {
  const { title, timeSlot, description, priority } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Task title is required' });
  }

  const newTask = {
    id: tasks.length > 0 ? Math.max(...tasks.map(t => t.id)) + 1 : 1,
    title,
    timeSlot: timeSlot || '',
    description: description || '',
    priority: priority || 'medium',
    completed: false,
    isActive: true,
    createdAt: new Date()
  };

  tasks.push(newTask);
  res.json(newTask);
});

app.put('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const { completed, title, timeSlot, description, priority } = req.body;

  const task = tasks.find(t => t.id === taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  if (completed !== undefined) task.completed = completed;
  if (title !== undefined) task.title = title;
  if (timeSlot !== undefined) task.timeSlot = timeSlot;
  if (description !== undefined) task.description = description;
  if (priority !== undefined) task.priority = priority;

  res.json(task);
});

app.delete('/api/tasks/:id', (req, res) => {
  const taskId = parseInt(req.params.id);
  const taskIndex = tasks.findIndex(t => t.id === taskId);

  if (taskIndex === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }

  tasks[taskIndex].isActive = false;
  res.json({ success: true });
});

// Configuration endpoint for frontend
app.get('/api/config', (req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID,
    authConfigured: GOOGLE_CLIENT_ID !== 'demo-client-id'
  });
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`ProductivePro server running on port ${PORT}`);
});