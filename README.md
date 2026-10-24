# ProductivePro

A comprehensive productivity application that combines time management, focus tools, and AI-powered study assistance to help users maximize their productivity and maintain focus throughout their work sessions.

https://github.com/user-attachments/assets/cfd4c46b-ef31-4332-bb70-fa98360471f3

## Features

### 🍅 Pomodoro Timer
- Customizable work and break sessions (5, 15, 25, 45 minutes)
- Fullscreen focus mode with keyboard shortcuts
- Session tracking and completion analytics
- Automatic break reminders and session management

### 🎵 FlowBeats White Noise Player
- Five noise types: White noise, Pink noise, Rain sounds, Ocean waves, Forest ambience
- Programmatic audio generation using Web Audio API for consistent quality
- Real-time switching between noise types during playback
- Volume control with seamless looping
- No external dependencies or streaming services required

### 📋 TaskPlanner
- Create tasks with titles, descriptions, and time slots
- Priority levels (Low, Medium, High) with color coding
- Mark tasks as complete with visual feedback
- Time-based task scheduling and organization

### 📚 SnapStudy PDF Flashcard Generator
- Upload PDF documents for automatic flashcard generation
- AI-powered content analysis using OpenAI GPT-4
- Customizable flashcard count and difficulty levels
- Interactive study mode with card flipping
- Fallback text-analysis for offline functionality

### 📊 Insights Dashboard
- Productivity analytics and session tracking
- Daily, weekly, and monthly productivity trends
- Focus vs. distraction time analysis
- Visual charts and progress indicators

### 💡 FocusFuel Motivation System
- Hourly inspirational quotes from Quotable.io API
- Local fallback quotes for offline functionality
- Non-intrusive popup notifications
- Persistent quote display with countdown timer

## Technical Stack

### Frontend
- **Framework**: Vanilla JavaScript with modern ES6+ features
- **Styling**: Tailwind CSS for responsive design
- **Icons**: Feather Icons library
- **Typography**: Inter font family
- **Audio**: Web Audio API for noise generation

### Backend
- **Runtime**: Node.js with Express.js framework
- **Database**: PostgreSQL with Neon serverless (production) / In-memory (development)
- **ORM**: Drizzle ORM for type-safe database operations
- **Authentication**: Session-based with bcryptjs password hashing
- **File Upload**: Multer middleware for PDF handling
- **Security**: Helmet.js, CORS configuration

### AI Integration
- **PDF Processing**: Python libraries (pdfplumber, PyPDF2, trafilatura) with cross-process communication
- **AI Generation**: GROQ API for intelligent flashcard creation with custom prompts
- **Fallback System**: Local text analysis algorithms ensure functionality without API dependency
- **Error Handling**: Robust fallback mechanisms for offline or API unavailable scenarios

### Infrastructure
- **Session Management**: Database-backed sessions with connect-pg-simple
- **Real-time Features**: WebSocket support via 'ws' library
- **Development Tools**: Nodemon for auto-restart, dotenv for environment management

## Installation and Setup

### Prerequisites
- Node.js (v18 or higher)
- Python 3.11+ with pip
- PostgreSQL database (for production) or use in-memory storage (development)
- Modern web browser with Web Audio API support

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd productivepro
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Install Python dependencies**
   ```bash
   pip install pdfplumber pypdf2 trafilatura
   ```

4. **Environment Configuration (Optional)**
   Create a `.env` file in the root directory:
   ```env
   # Required for AI-powered flashcards
   OPENAI_API_KEY=your_openai_api_key_here
   
   # Database configuration (optional - uses in-memory by default)
   DATABASE_URL=postgresql://username:password@host:port/database
   
   # OAuth configuration (optional)
   GOOGLE_CLIENT_ID=your_google_client_id_here
   ```

5. **Start the application**
   ```bash
   npm start
   ```

6. **Access the application**
   Open your browser and navigate to `http://localhost:5000`

## Project Structure

```
productivepro/
├── server/
│   ├── index.js              # Main Express server
│   ├── db.ts                 # Database connection and configuration
│   ├── storage.ts            # Database storage interface and implementation
│   ├── pdf_processor.py     # Python PDF text extraction
│   └── pdf_fallback.js      # JavaScript PDF processing fallback
├── shared/
│   └── schema.ts             # Database schema definitions
├── uploads/                  # PDF upload directory (auto-created)
├── index.html               # Main application page
├── interactive.html         # Interactive features page
├── auth.js                  # Authentication frontend logic
├── script.js                # Landing page functionality
├── interactive-script.js   # Main application functionality
├── styles.css              # Custom CSS styles
├── package.json            # Node.js dependencies
├── requirements.txt        # Python dependencies
└── setup-local.js         # Local development setup script
```

## API Documentation

### Authentication Endpoints
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/check` - Check authentication status

### Pomodoro Timer Endpoints
- `GET /api/pomodoro/current` - Get current session
- `POST /api/pomodoro/start` - Start new session
- `POST /api/pomodoro/pause` - Pause current session
- `POST /api/pomodoro/resume` - Resume paused session
- `POST /api/pomodoro/complete` - Complete session
- `POST /api/pomodoro/stop` - Stop session
- `GET /api/pomodoro/history` - Get session history

### Task Management Endpoints
- `GET /api/tasks` - Get all tasks
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task

### SnapStudy Endpoints
- `POST /api/snapstudy/upload` - Upload PDF file
- `POST /api/snapstudy/generate` - Generate flashcards from text

### White Noise Player Endpoints
- `GET /api/flowbeats/current` - Get available noise types and player status

### Insights Endpoints
- `GET /api/insights` - Get productivity insights
- `GET /api/insights/chart-data` - Get chart data for visualizations

### Quote System Endpoints
- `GET /api/quotes/current` - Get current motivational quote

## Database Schema

The application uses a comprehensive database schema with the following main tables:
- `users` - User account information
- `pomodoro_sessions` - Timer session tracking
- `blocked_sites` - Website blocking rules
- `whitelist_sites` - Allowed websites
- `blocking_schedules` - Time-based blocking schedules
- `usage_insights` - Productivity analytics data
- `nudges` - User notifications and reminders
- `leaderboard_scores` - Gamification features

## Development vs Production

### Development Mode
- Uses in-memory storage for rapid prototyping
- Simplified authentication (demo mode available)
- Hot-reload with nodemon
- Comprehensive error logging

### Production Deployment
- PostgreSQL database with connection pooling
- Session persistence across server restarts
- Security headers and CORS configuration
- Environment-based configuration management

## Security Features

- **Password Security**: bcryptjs hashing with salt rounds
- **Session Management**: Secure cookie-based sessions
- **CORS Protection**: Configurable origin allowlist
- **File Upload Security**: PDF-only filtering with size limits
- **SQL Injection Prevention**: Parameterized queries via Drizzle ORM

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Performance Optimizations

- **Client-side Audio Generation**: Web Audio API implementation eliminates streaming dependencies and reduces server load
- **Connection Pooling**: Efficient database connection management with automatic scaling
- **Lazy Loading**: Components initialized only when needed to reduce initial page load
- **Memory Management**: Proper cleanup of audio contexts, timers, and event listeners
- **Cross-process Communication**: Optimized Python-Node.js integration for PDF processing
- **Fallback Systems**: Multiple layers of redundancy ensure consistent functionality

## Browser Compatibility

- Chrome 80+
- Firefox 75+
- Safari 13+
- Edge 80+

Requires modern browser support for Web Audio API and ES6+ features.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Troubleshooting

### Common Issues

**PDF Upload Not Working**
- Ensure Python dependencies are installed: `pip install pdfplumber pypdf2`
- Check that uploads directory exists and is writable
- Verify PDF file size is under 10MB limit

**White Noise Not Playing**
- Click play button after page loads (browsers require user interaction for audio)
- Check browser console for Web Audio API errors
- Try different noise types - White and Pink use programmatic generation, others use oscillators
- Ensure browser supports Web Audio API (Chrome 80+, Firefox 75+, Safari 13+)

**Database Connection Issues**
- Verify DATABASE_URL environment variable is set correctly
- Check network connectivity to database server
- Review server logs for connection error details

**AI Flashcard Generation Failing**
- Verify OPENAI_API_KEY is set and valid
- Check API key permissions and usage limits
- Fallback text analysis will work without API key

For additional support, check the browser console for error messages and review server logs for detailed debugging information.
