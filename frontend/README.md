# StudyWebPlanner frontend

React + TypeScript + Vite.

```bash
npm install
npm run dev      # http://localhost:5173 (needs Django running on :8000)
npm run build    # typecheck + production build into dist/
npm run lint
```

In development, Vite forwards `/api` and `/admin` to Django on port 8000, so
the browser sees a single site and session cookies + CSRF work as-is.
