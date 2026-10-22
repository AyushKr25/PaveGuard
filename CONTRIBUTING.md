# Contributing to SmartPothole AI

Thank you for your interest in contributing to SmartPothole AI! This document provides guidelines for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our Code of Conduct. Please be respectful, inclusive, and constructive in all interactions.

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/your-org/smartpothole-ai/issues)
2. If not, create a new issue with:
   - Clear, descriptive title
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots (if applicable)
   - Environment details (OS, browser, versions)

### Suggesting Features

1. Check existing issues and discussions
2. Create a feature request issue with:
   - Clear description of the feature
   - Use cases and benefits
   - Possible implementation approach

### Code Contributions

#### Development Setup

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/your-username/smartpothole-ai.git
   cd smartpothole-ai
   ```
3. Install dependencies:
   ```bash
   # Frontend
   cd frontend && npm install
   
   # AI Service
   cd ai-service && python -m venv venv && source venv/bin/activate && pip install -r requirements.txt
   ```
4. Set up environment variables (copy `.env.example` to `.env.local`)
5. Run development servers:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d
   ```

#### Making Changes

1. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make your changes following the style guides below
3. Write tests for new functionality
4. Ensure all tests pass:
   ```bash
   # Frontend
   cd frontend && npm run lint && npm run typecheck && npm run test
   
   # AI Service
   cd ai-service && pytest && ruff check .
   ```
5. Commit with clear messages:
   ```bash
   git commit -m "feat: add new detection visualization"
   ```
6. Push to your fork and create a Pull Request

## Style Guides

### Frontend (TypeScript/React)

- Use TypeScript strict mode
- Follow ESLint + Prettier configuration
- Use functional components with hooks
- Use shadcn/ui components
- Write JSDoc for complex functions
- Component naming: PascalCase
- File naming: kebab-case
- Export types from `@/types`

### Backend (Python/FastAPI)

- Follow PEP 8 (enforced by Ruff)
- Use type hints everywhere
- Write docstrings for public functions
- Use Pydantic models for validation
- Keep functions small and focused
- Module naming: snake_case
- Use async/await for I/O operations

### Database (SQL)

- Use snake_case for tables and columns
- Add comments for complex logic
- Use proper indexes
- Always include RLS policies
- Use UUID for primary keys
- Use timestamptz for timestamps

### Git Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation
- `style`: Formatting
- `refactor`: Code restructuring
- `test`: Tests
- `chore`: Maintenance

Examples:
```
feat(detection): add severity color coding
fix(api): handle video upload timeout
docs(readme): update deployment guide
```

## Pull Request Process

1. Ensure PR description clearly describes the changes
2. Link related issues
3. All CI checks must pass
4. Request review from maintainers
5. Address review comments
5. Squash commits if requested
6. Maintainers will merge

## Testing

### Frontend Tests
```bash
cd frontend
npm run test           # Unit tests
npm run test:coverage  # Coverage report
npm run test:e2e       # E2E tests (Playwright)
```

### Backend Tests
```bash
cd ai-service
pytest                 # All tests
pytest -v             # Verbose
pytest --cov          # Coverage
```

## Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md for structural changes
- Update DEPLOYMENT.md for deployment changes
- Add docstrings for new functions/classes
- Update API documentation if endpoints change

## Release Process

1. Maintainers create release branch
2. Version bump in package.json and pyproject.toml
3. Generate changelog
4. Create GitHub release
5. Deploy to staging
6. Deploy to production

## Questions?

- Open a [Discussion](https://github.com/your-org/smartpothole-ai/discussions)
- Join our community chat (if available)
- Email: contribute@smartpothole.ai

Thank you for contributing to SmartPothole AI!