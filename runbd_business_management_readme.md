# RunBD Business Management Application

A real-time, multi-role business operations, lead management, and automated team performance tracking platform built for **RunBD**, featuring seamless Google Sheets synchronization and automated daily reporting.

---

## 🚀 Key Features

- **Role-Based Access Control (RBAC):** Dedicated workspaces and login credentials for Admins, Call Center Agents, Data Collectors, and Social/Web Content Posters.
- **Automated Lead Distribution:** Intelligent Round-Robin lead assignment across all 6 Call Center Agents.
- **Strict Duplicate Guard:** Normalizes phone numbers and validates Facebook/Website URLs to prevent duplicate entries across the system.
- **Real-Time Multi-Tab Google Sheets Sync:** Instant webhook integration via Google Apps Script that maintains separate live tabs for master data, individual agents, call logs, link submissions, and daily summaries.
- **Final Daily Summary & CSV Export:** Consolidated daily analytics tracking agent calls, deals, order confirmations, collector volume, and social/web link submissions with one-click CSV export.

---

## 👥 Team Structure & Roles

| Role | Team Members | Core Responsibilities |
| :--- | :--- | :--- |
| **Admin / Supervisor** | Sibly Sadik Shimul | Full system oversight, lead distribution, analytics, audit logs, and daily report exports. |
| **Call Center Agents (6)** | Tanjin, Kathy, Tania, Shanaz, Sizon, Sakib | Managing assigned lead queues, logging call statuses, scheduling follow-ups, and confirming orders. |
| **Data Collectors (2)** | Farhan, Naim | Entering new customer leads (single or bulk) with real-time duplicate validation. |
| **Social & Web Poster (1)** | Kawsar | Submitting and tracking daily Facebook post links and Website data/product links. |

---

## 📊 Google Sheets Architecture

The integrated Google Apps Script automatically creates and maintains the following tabs in real time:

1. **`Master_Data`**: Complete database of all leads, collectors, assigned agents, and current statuses.
2. **`Agent_[Name]`** *(6 Dedicated Tabs)*: Individual tabs (`Agent_Tanjin`, `Agent_Kathy`, `Agent_Tania`, `Agent_Shanaz`, `Agent_Sizon`, `Agent_Sakib`) showing only leads assigned to each respective agent.
3. **`Agent_Logs`**: Immutable chronological audit trail of every call log and status update.
4. **`Kawsar_Posts_Log`**: Tracks all Facebook and Website post links submitted by Kawsar.
5. **`Final_Daily_Summary`**: Automated daily rollup tracking:
   - Agent-wise calls made, deals handled, and confirmed orders.
   - Collector-wise lead entry counts (Farhan & Naim).
   - Kawsar's daily Facebook and Website link counts.

---

## ⚙️ Setup & Deployment Guide

### 1. Google Sheets Webhook Setup
1. Open your target **Google Sheet** and navigate to **Extensions → Apps Script**.
2. Paste the RunBD Apps Script synchronization code into `Code.gs` and save.
3. Click **Deploy → New deployment** (or **Manage deployments → Edit → New version**).
4. Set **Execute as** to `Me` and **Who has access** to `Anyone`.
5. Copy the generated **Web App URL**.

### 2. Connect to RunBD Application
1. Log in as **Admin / Supervisor** (`admin@runbd`).
2. Navigate to **Google Sheets Sync** in the sidebar.
3. Paste the **Web App URL** and click **Save & Sync**.

---

## 👨‍💻 Developer

Developed by **[Shimul.Dev](https://siblysadik-dev.vercel.app/)**