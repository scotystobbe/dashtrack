# DashTrack

A web application for tracking DoorDash shifts, earnings, and expenses with cloud database persistence.

## 🚀 Features

- **Shift Tracking**: Record start/end times, breaks, and calculate working hours
- **Earnings Management**: Track gross pay, gas costs, and calculate net earnings
- **Odometer Tracking**: Monitor miles driven and fuel consumption
- **Data Persistence**: Cloud database storage with Supabase
- **Export Options**: CSV export and JSON backup/restore
- **Responsive Design**: Works on desktop and mobile devices
- **Offline Support**: Service worker for offline functionality

## 🗄️ Database Setup (Supabase)

### 1. Create Supabase Account
1. Go to [supabase.com](https://supabase.com)
2. Sign up for a free account
3. Create a new project

### 2. Get Your Credentials
1. Go to **Settings** > **API** in your Supabase dashboard
2. Copy your **Project URL** and **anon public key**

### 3. Set Environment Variables
**For Vercel Deployment**: Environment variables are automatically provided by Vercel's Supabase integration.

**For Local Development**: Create a `.env.local` file in your project root:
```bash
SUPABASE_URL=your_project_url_here
SUPABASE_ANON_KEY=your_anon_key_here
```

### 4. Create Database Table
In your Supabase dashboard, go to **SQL Editor** and run the contents of `database-schema.sql`

## 🚀 Deployment (Vercel)

### 1. Push to GitHub
```bash
git add .
git commit -m "Add Supabase integration"
git push origin main
```

### 2. Vercel Environment Variables
**Automatic Setup**: Vercel automatically provides Supabase environment variables when you connect your Supabase project.

**Manual Setup** (if needed):
1. Go to your Vercel project dashboard
2. Navigate to **Settings** > **Environment Variables**
3. Add:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_ANON_KEY` = your Supabase anon key

### 3. Deploy
Vercel will automatically deploy when you push to GitHub!

## 🛠️ Local Development

### Install Dependencies
```bash
npm install
```

### Start Local Server
```bash
python3 -m http.server 8000
```

### Environment Setup
Copy `env.example` to `.env.local` and fill in your Supabase credentials.

## 📱 Usage

1. **Add Shift**: Fill out the form with date, times, miles, and earnings
2. **Manage Data**: Use the hamburger menu (☰) for export, import, and data management
3. **View Summary**: Toggle between net and gross values in the summary section
4. **Edit Shifts**: Click the edit button to modify existing entries

## 🔧 Technical Details

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: Supabase (PostgreSQL)
- **Storage**: Cloud database with localStorage fallback
- **Deployment**: Vercel with automatic GitHub integration
- **Offline**: Service worker for offline functionality

## 📊 Data Structure

Each shift record includes:
- Date and timing information
- Earnings (gross, net, hourly rate)
- Mileage tracking
- Fuel costs and consumption
- Break intervals (JSON array)

## 🔒 Security

- Row Level Security (RLS) enabled on database
- Public read/write access (can be restricted later)
- Environment variables for sensitive credentials

## 🚨 Troubleshooting

### Supabase Connection Issues
1. Check your environment variables
2. Verify your Supabase project is active
3. Check the browser console for error messages

### Data Not Persisting
1. Ensure Supabase credentials are correct
2. Check if the database table was created
3. Verify RLS policies are configured

## 📝 License

ISC License - feel free to use and modify as needed!
