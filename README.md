# Sweata Portfolio

A separate portfolio rebuild for Sweata Chakraborty using:

- React + Vite for the frontend
- Express for the backend
- SQLite for local data storage
- Local file storage for the profile image, resume, and future uploads

## Included sections

- Public home page
- Experience page
- Projects page
- Contact page with message form
- Private admin dashboard for profile, contact, experience, projects, skills, and messages

## Setup

1. Copy `.env.example` to `.env` in the project root if you want custom values.
2. Install dependencies:

```bash
npm install
npm install --prefix server
npm install --prefix client
```

3. Start the development servers:

```bash
npm run dev
```

## Useful commands

```bash
npm run db:init
npm run owner:create -- --email "you@example.com" --name "Your Name" --password "strongpassword"
npm run build
npm run start
npm run backup
```

## Notes

- The project includes bundled seed files in `server/seed-assets`, so a fresh server can initialize the default profile image and resume without relying on local machine paths.
- You can still override those seed files with `SEED_PROFILE_IMAGE_SOURCE` and `SEED_RESUME_SOURCE` in `.env` if needed.
- Public admin links are intentionally hidden from the site navigation. Access them directly through `/login` and `/dashboard`.
