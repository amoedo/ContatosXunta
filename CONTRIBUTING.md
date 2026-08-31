# Contributing

Thanks for your interest in contributing to **ContatosXunta**.

## Before you start

Please read the README to understand the project structure:

- `pipeline/`: Python ingestion, validation, and data compilation
- `web/`: Astro/React static site

## Ways to contribute

- Report bugs
- Suggest improvements
- Fix issues
- Improve documentation
- Add or refine tests

## Workflow

1. Fork the repository.
2. Create a feature branch.
3. Make your changes.
4. Run the relevant checks:
   - `python -m pytest pipeline/tests -q`
   - `npm run check`
   - `npm run build`
   - `npm test`
   - `npm run test:e2e`
5. Open a pull request.

## Guidelines

- Keep changes focused and easy to review.
- Follow the existing code style and project conventions.
- Include tests when you change behavior.
- Update documentation when needed.
- Avoid committing generated data unless the project explicitly requires it.

## Pull requests

Please include:
- A clear description of the change
- The reason for the change
- Any relevant screenshots or examples
- Notes about tests you ran

## Code of conduct

Be respectful and constructive in all discussions and reviews.
