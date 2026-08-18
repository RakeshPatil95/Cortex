# Legal Case Chat System

A comprehensive AI-powered chat interface for searching and analyzing legal case data using hybrid search (Text-to-SQL + Vector Search).

## 🚀 Features

### Hybrid Search Architecture
- **LangChain Text-to-SQL**: Advanced natural language to SQL conversion with schema awareness
- **Vector Search**: Semantic search for document content and case summaries
- **Smart Routing**: AI automatically determines the best search strategy
- **AI-Generated Suggestions**: Context-aware follow-up questions based on search results

### Conversational Interface
- Natural language queries
- AI-generated contextual responses with structured results
- AI-powered suggested questions based on search context
- Real-time search results with intelligent routing

### Data Integration
- Case metadata from Prisma database
- Document content from Pinecone vector database
- Automatic embedding generation and storage
- Real-time updates when cases are created/modified

## 🏗️ Architecture

### Services Structure
```
src/services/chat/
├── index.js              # Main orchestrator
├── queryAnalyzer.js      # Query intent analysis
├── textToSql.js          # SQL query generation
├── vectorSearch.js       # Vector similarity search
└── responseFormatter.js  # Response formatting
```

### API Endpoints
- `POST /api/chat` - Process chat messages
- `GET /api/chat?action=suggestions` - Get suggested questions
- `GET /api/chat?action=health` - Health check

### Components
- `ChatContent.jsx` - Main chat interface
- `ChatMessage.jsx` - Individual message component
- `CaseResultCard.jsx` - Case result display
- `DocumentResultCard.jsx` - Document result display

## 🔧 Setup

### Prerequisites
- Node.js 18+
- PostgreSQL database
- Pinecone account
- OpenAI API key
- LangChain for Text-to-SQL

### Environment Variables
```env
OPENAI_API_KEY=your_openai_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=legal-documents
DATABASE_URL=your_database_url
```

### Installation
1. Install dependencies:
```bash
npm install
```

2. Install LangChain dependencies:
```bash
npm install langchain langchain-openai
```

3. Set up the database:
```bash
npm run db:push
```

4. Start the development server:
```bash
npm run dev
```

## 💬 Usage Examples

### Case Metadata Queries
- "Show me all my cases"
- "Find high priority cases"
- "Which cases are assigned to Ahmad?"
- "Show me cases filed last month"
- "Find criminal cases with upcoming hearings"

### Document Content Queries
- "Search for fraud documents"
- "Find contracts mentioning payment terms"
- "Show me evidence documents"
- "Search for medical records"

### Hybrid Queries
- "Find criminal cases with contract documents"
- "Show me fraud cases and their evidence"
- "Search for cases with specific document types"

## 🔍 Search Flow

1. **Query Analysis**: AI determines search intent (case/document/hybrid)
2. **Route Processing**: 
   - Case queries → Text-to-SQL → Prisma database
   - Document queries → Vector search → Pinecone
   - Hybrid queries → Both approaches combined
3. **Result Formatting**: Conversational response with structured cards
4. **Suggestions**: Context-aware follow-up questions

## 📊 Data Storage

### Pinecone Vectors
- **Document Chunks**: Text content with case context
- **Case Summaries**: Structured case metadata as embeddings
- **Metadata**: userId, caseId, documentId, type, parties, dates

### Case Summary Format
```
Case 12345 (CASE-2024-001). Category: Criminal. Type: Fraud. 
Status: active, Stage: Under Review. Priority: high. 
Assigned to: Ahmad Al-Rashid. Filed: 1/15/2024. 
Next hearing: 2/20/2024. Parties: John Doe (defendant), Jane Smith (plaintiff). 
Memo: Initial investigation shows evidence of financial fraud...
```

## 🛠️ Development

### Adding New Search Types
1. Update `queryAnalyzer.js` to recognize new patterns
2. Add corresponding logic in `textToSql.js` or `vectorSearch.js`
3. Update `responseFormatter.js` for new result types

### Customizing Responses
- Modify `responseFormatter.js` for different response styles
- Update `ChatMessage.jsx` for UI changes
- Add new result card components as needed

### Testing
```bash
# Run the test script
node test-chat.js

# Or test manually in browser
http://localhost:3000/chat
```

## 🔒 Security

- All queries require authentication via NextAuth
- User data isolation (users only see their own cases)
- SQL injection protection via Prisma
- Input validation and sanitization

## 📈 Performance

- Async processing for non-critical operations
- Caching of embeddings and search results
- Pagination for large result sets
- Error handling with graceful degradation

## 🐛 Troubleshooting

### Common Issues

1. **No search results**: Check if cases exist and embeddings are stored
2. **Authentication errors**: Verify NextAuth configuration
3. **Pinecone errors**: Check API key and index configuration
4. **Database errors**: Verify Prisma connection and schema

### Debug Mode
Set `NODE_ENV=development` to see detailed error messages in API responses.

## 🚀 Deployment

1. Set up production environment variables
2. Deploy to your preferred platform (Vercel, Railway, etc.)
3. Ensure Pinecone index is properly configured
4. Run database migrations
5. Test the chat functionality

## 🤖 AI-Powered Features

### LangChain Text-to-SQL
- **Advanced Query Generation**: Uses LangChain with OpenAI to convert natural language to precise SQL queries
- **Schema Awareness**: AI understands database structure and relationships
- **Security**: Built-in protection against SQL injection with parameterized queries
- **Fallback Handling**: Graceful degradation when AI query generation fails

### AI-Generated Suggestions
- **Contextual Intelligence**: Suggestions based on current search results and user intent
- **Dynamic Adaptation**: Questions adapt to the type of data found (cases vs documents)
- **Natural Language**: AI generates conversational, helpful follow-up questions
- **Smart Filtering**: Removes duplicate or irrelevant suggestions

### Intelligent Query Analysis
- **Intent Recognition**: AI determines whether to use SQL, Vector search, or hybrid approach
- **Parameter Extraction**: Automatically identifies time ranges, categories, priorities from queries
- **Confidence Scoring**: Provides confidence levels for search strategies
- **Context Awareness**: Considers conversation history for better understanding

## 📝 API Reference

### POST /api/chat
```json
{
  "message": "Show me all my cases",
  "history": [
    {"role": "user", "content": "Hello"},
    {"role": "assistant", "content": "Hi! How can I help?"}
  ],
  "filters": {
    "caseType": "criminal"
  }
}
```

### Response Format
```json
{
  "success": true,
  "message": "I found 3 cases matching your search...",
  "results": {
    "cases": [...],
    "documents": [...]
  },
  "suggestedQuestions": [
    "Show me high priority cases",
    "Find fraud documents"
  ],
  "intent": "case",
  "confidence": 0.95,
  "totalResults": {
    "cases": 3,
    "documents": 0
  }
}
```

## 🤝 Contributing

1. Follow the existing code structure
2. Add tests for new features
3. Update documentation
4. Ensure all linting passes
5. Test with various query types

## 📄 License

This project is part of the Cortex Legal Case Management System.
