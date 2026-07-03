'use client';

import React, { useState, useEffect, useTransition, useMemo } from 'react';
import { read, utils, writeFile } from 'xlsx';
import {
  Mail,
  Upload,
  Download,
  Plus,
  Trash2,
  Play,
  CheckCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Search,
  FileText,
  Sparkles,
  Database,
  ExternalLink
} from 'lucide-react';
import {
  sendSingleEmailAction,
  getEmailLogsAction,
  clearEmailLogsAction
} from './actions/outreach';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell
} from '../components/ui/table';

// Interface for Influencer rows (dynamic columns allowed)
interface InfluencerRow {
  id: string;
  Email: string;
  Name?: string;
  [key: string]: any; // Allow arbitrary custom column headers
}

interface EmailHistoryLog {
  id: string;
  recipientEmail: string;
  recipientName: string | null;
  senderEmail: string;
  subject: string;
  body: string;
  status: string;
  errorMessage: string | null;
  sentAt: string | Date;
}

const DEFAULT_INFLUENCERS: InfluencerRow[] = [
  { id: '1', Email: 'jane.doe@example.com', Name: 'Jane Doe', Niche: 'Beauty', Followers: '120K', Brand: 'GlowStyle' },
  { id: '2', Email: 'john.smith@example.com', Name: 'John Smith', Niche: 'Tech', Followers: '45K', Brand: 'ByteTech' },
  { id: '3', Email: 'alice.j@example.com', Name: 'Alice Johnson', Niche: 'Lifestyle', Followers: '250K', Brand: 'LuxeLife' }
];

export default function OutreachDashboard() {
  // Config state
  const [senderEmail, setSenderEmail] = useState('outreach@brandley.ai');
  const [subjectTemplate, setSubjectTemplate] = useState('Collab Request: {{Brand}} x {{Name}}');
  const [bodyTemplate, setBodyTemplate] = useState(
    `Hi {{Name}},\n\nWe love your content in the {{Niche}} niche (especially with your {{Followers}} followers!). We'd love to partner with you for our brand, {{Brand}}.\n\nLet us know if you're interested!\n\nBest,\nOutreach Team`
  );

  // Table rows
  const [influencers, setInfluencers] = useState<InfluencerRow[]>(DEFAULT_INFLUENCERS);
  
  // Track status for each row during sending process
  // e.g. { '1': 'sending' | 'success' | 'failed' | 'idle', ... }
  const [sendStatuses, setSendStatuses] = useState<Record<string, { status: 'idle' | 'sending' | 'success' | 'failed'; error?: string }>>({});
  
  // Sending execution states
  const [isSendingBatch, setIsSendingBatch] = useState(false);
  const [currentSendingIndex, setCurrentSendingIndex] = useState<number | null>(null);

  // History logs from DB
  const [emailLogs, setEmailLogs] = useState<EmailHistoryLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const [logsSearchTerm, setLogsSearchTerm] = useState('');
  const [logsStatusFilter, setLogsStatusFilter] = useState('ALL');

  // Target influencers table sending mode
  const [sendMode, setSendMode] = useState<'sequential' | 'burst'>('sequential');

  // Target influencers table pagination state
  const [influencersPage, setInfluencersPage] = useState(1);
  const [influencersRowsPerPage, setInfluencersRowsPerPage] = useState(10);

  // Email logs table pagination state
  const [logsPage, setLogsPage] = useState(1);
  const [logsRowsPerPage, setLogsRowsPerPage] = useState(10);

  // Reset logs page on search or filter change
  useEffect(() => {
    setLogsPage(1);
  }, [logsSearchTerm, logsStatusFilter]);

  // Load email history on mount
  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await getEmailLogsAction();
      if (res.success && res.logs) {
        // cast because DateTime comes back as string from server actions serialize
        setEmailLogs(res.logs as any[]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleClearLogs = async () => {
    if (confirm('Are you sure you want to delete all historical logs? This cannot be undone.')) {
      const res = await clearEmailLogsAction();
      if (res.success) {
        setEmailLogs([]);
      } else {
        alert('Failed to clear logs: ' + res.error);
      }
    }
  };

  // Get all unique placeholders from the body template (e.g. Name, Niche, Followers, Brand)
  const templatePlaceholders = useMemo(() => {
    const vars = new Set<string>();
    const regex = /\{\{\s*([^}]+?)\s*\}\}/g;
    let match;
    while ((match = regex.exec(bodyTemplate)) !== null) {
      if (match[1]) {
        const trimmed = match[1].trim();
        if (trimmed) {
          vars.add(trimmed);
        }
      }
    }
    return Array.from(vars);
  }, [bodyTemplate]);

  // Combine columns from the current influencers list AND detected template placeholders
  const availableVariables = useMemo(() => {
    const vars = new Set<string>();
    
    // 1. Add all keys from the current influencers list
    influencers.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== 'id') {
          vars.add(key);
        }
      });
    });
    
    // 2. Add any placeholders detected in the body template
    templatePlaceholders.forEach(p => {
      vars.add(p);
    });
    
    return Array.from(vars);
  }, [influencers, templatePlaceholders]);

  // Paginated influencers calculation
  const totalInfluencerPages = Math.max(1, Math.ceil(influencers.length / influencersRowsPerPage));
  const activeInfluencerPage = Math.min(influencersPage, totalInfluencerPages);
  
  const paginatedInfluencers = useMemo(() => {
    return influencers.slice(
      (activeInfluencerPage - 1) * influencersRowsPerPage,
      activeInfluencerPage * influencersRowsPerPage
    );
  }, [influencers, activeInfluencerPage, influencersRowsPerPage]);

  // Parse template with row data
  const compileTemplate = (template: string, row: InfluencerRow): string => {
    let result = template;
    availableVariables.forEach(key => {
      const value = row[key] !== undefined && row[key] !== null ? String(row[key]) : '';
      // Replace all instances of {{key}} case-insensitively
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      result = result.replace(regex, value);
    });
    return result;
  };

  // Import CSV / XLSX
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = utils.sheet_to_json<any>(worksheet);

        if (json.length === 0) {
          alert('The uploaded file appears to be empty.');
          return;
        }

        // Validate that an 'Email' column exists (case-insensitive checking)
        const sampleRow = json[0];
        const emailKey = Object.keys(sampleRow).find(
          k => k.toLowerCase() === 'email'
        );

        if (!emailKey) {
          alert('Could not find an "Email" column in the file. Please ensure one of your column headers is "Email".');
          return;
        }

        // Map columns to standard "Email" and custom ones, assigning stable IDs
        const formattedRows: InfluencerRow[] = json.map((row, index) => {
          const newRow: InfluencerRow = { id: `imported-${index}-${Date.now()}`, Email: '' };
          Object.keys(row).forEach(key => {
            if (key.toLowerCase() === 'email') {
              newRow.Email = row[key];
            } else if (key.toLowerCase() === 'name') {
              newRow.Name = row[key];
            } else {
              newRow[key] = row[key]; // Keep custom columns
            }
          });
          return newRow;
        });

        setInfluencers(formattedRows);
        setSendStatuses({});
        setInfluencersPage(1);
      } catch (err: any) {
        alert('Failed to parse file: ' + err.message);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Export current list back to Excel
  const handleExportList = () => {
    if (influencers.length === 0) return;
    
    // Strip IDs from exported data
    const exportData = influencers.map(({ id, ...rest }) => rest);
    
    const worksheet = utils.json_to_sheet(exportData);
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, worksheet, 'Influencers');
    
    writeFile(workbook, 'outreach_influencers.xlsx');
  };

  // Add a manual row
  const handleAddRow = () => {
    // Collect standard columns
    const columns: Record<string, string> = {};
    availableVariables.forEach(v => {
      if (v !== 'Email' && v !== 'Name') {
        columns[v] = '';
      }
    });

    const newRow: InfluencerRow = {
      id: `manual-${Date.now()}`,
      Email: '',
      Name: '',
      ...columns
    };
    setInfluencers([...influencers, newRow]);
    
    // Auto navigate to the page where the new row is added
    const nextTotalPages = Math.max(1, Math.ceil((influencers.length + 1) / influencersRowsPerPage));
    setInfluencersPage(nextTotalPages);
  };

  // Delete a row
  const handleRemoveRow = (id: string) => {
    setInfluencers(influencers.filter(row => row.id !== id));
    const newStatuses = { ...sendStatuses };
    delete newStatuses[id];
    setSendStatuses(newStatuses);
  };

  // Update a single cell in the table
  const handleCellEdit = (id: string, field: string, value: string) => {
    setInfluencers(
      influencers.map(row => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  // Batch Outreach Sender (Sequential with 500ms delay or Burst/Parallel)
  const handleSendOutreach = async () => {
    if (influencers.length === 0) {
      alert('Please add or import influencers first.');
      return;
    }

    const invalidEmails = influencers.filter(row => !row.Email || !row.Email.includes('@'));
    if (invalidEmails.length > 0) {
      alert(`Please fix the email addresses. There are ${invalidEmails.length} rows with invalid/missing emails.`);
      return;
    }

    setIsSendingBatch(true);
    const initialStatuses = { ...sendStatuses };
    
    // Set all rows to idle status before sending
    influencers.forEach(row => {
      initialStatuses[row.id] = { status: 'idle' };
    });
    setSendStatuses(initialStatuses);

    if (sendMode === 'sequential') {
      // Send sequentially
      for (let i = 0; i < influencers.length; i++) {
        const row = influencers[i];
        setCurrentSendingIndex(i);

        // Update row status to sending
        setSendStatuses(prev => ({
          ...prev,
          [row.id]: { status: 'sending' }
        }));

        // Render templates
        const compiledSubject = compileTemplate(subjectTemplate, row);
        const compiledBody = compileTemplate(bodyTemplate, row);

        try {
          const result = await sendSingleEmailAction({
            senderEmail,
            recipientEmail: row.Email,
            recipientName: row.Name || '',
            subject: compiledSubject,
            body: compiledBody
          });

          if (result.success) {
            setSendStatuses(prev => ({
              ...prev,
              [row.id]: { status: 'success' }
            }));
          } else {
            setSendStatuses(prev => ({
              ...prev,
              [row.id]: { status: 'failed', error: result.error }
            }));
          }
        } catch (err: any) {
          setSendStatuses(prev => ({
            ...prev,
            [row.id]: { status: 'failed', error: err.message || 'Unknown network error' }
          }));
        }

        // 500ms delay between sending next email
        if (i < influencers.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    } else {
      // Burst (Parallel/Concurrent sending)
      const promises = influencers.map(async (row) => {
        // Update row status to sending
        setSendStatuses(prev => ({
          ...prev,
          [row.id]: { status: 'sending' }
        }));

        // Render templates
        const compiledSubject = compileTemplate(subjectTemplate, row);
        const compiledBody = compileTemplate(bodyTemplate, row);

        try {
          const result = await sendSingleEmailAction({
            senderEmail,
            recipientEmail: row.Email,
            recipientName: row.Name || '',
            subject: compiledSubject,
            body: compiledBody
          });

          setSendStatuses(prev => ({
            ...prev,
            [row.id]: result.success 
              ? { status: 'success' } 
              : { status: 'failed', error: result.error }
          }));
        } catch (err: any) {
          setSendStatuses(prev => ({
            ...prev,
            [row.id]: { status: 'failed', error: err.message || 'Unknown network error' }
          }));
        }
      });

      // Await all concurrently
      await Promise.all(promises);
    }

    setIsSendingBatch(false);
    setCurrentSendingIndex(null);
    fetchLogs(); // Reload email history log from database
  };

  // Filter logs based on search and status tabs
  const filteredLogs = useMemo(() => {
    return emailLogs.filter(log => {
      const matchesSearch =
        log.recipientEmail.toLowerCase().includes(logsSearchTerm.toLowerCase()) ||
        (log.recipientName && log.recipientName.toLowerCase().includes(logsSearchTerm.toLowerCase())) ||
        log.subject.toLowerCase().includes(logsSearchTerm.toLowerCase());
      
      const matchesStatus =
        logsStatusFilter === 'ALL' || log.status === logsStatusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [emailLogs, logsSearchTerm, logsStatusFilter]);

  // Paginated email logs calculation
  const totalLogPages = Math.max(1, Math.ceil(filteredLogs.length / logsRowsPerPage));
  const activeLogPage = Math.min(logsPage, totalLogPages);

  const paginatedLogs = useMemo(() => {
    return filteredLogs.slice(
      (activeLogPage - 1) * logsRowsPerPage,
      activeLogPage * logsRowsPerPage
    );
  }, [filteredLogs, activeLogPage, logsRowsPerPage]);

  return (
    <div className="flex-1 bg-slate-900 text-slate-100 font-sans min-h-screen">
      {/* Top Banner Header */}
      <header className="border-b border-slate-800 bg-slate-950 px-6 py-4 sticky top-0 z-10 shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-tr from-violet-600 to-indigo-500 p-2.5 rounded-xl shadow-md shadow-indigo-900/50">
              <Mail className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                Brandley.ai
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-violet-950 border border-violet-800 text-violet-300">
                  Outreach MVP
                </span>
              </h1>
              <p className="text-xs text-slate-400">Scale personalized influencer campaigns seamlessly</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <a
              href="http://localhost:8025"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-sm transition-all"
            >
              <span>Open Mailpit UI (8025)</span>
              <ExternalLink className="h-4 w-4" />
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col gap-8">
        
        {/* Core Controls: Split configuration and lists */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Columns - Setup Panel (Templates, Variables) */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            
            {/* Template Card */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
              <div className="flex items-center gap-2 border-b border-slate-850 pb-3">
                <Sparkles className="h-5 w-5 text-violet-400" />
                <h2 className="text-lg font-semibold text-white">Campaign Template</h2>
              </div>

              {/* Sender address */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Sender Email ID</label>
                <input
                  type="email"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="outreach@brand.com"
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 text-white placeholder-slate-600 transition-colors"
                />
              </div>

              {/* Subject */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Subject Template</label>
                <input
                  type="text"
                  value={subjectTemplate}
                  onChange={(e) => setSubjectTemplate(e.target.value)}
                  placeholder="e.g. Collaboration Offer for {{Name}}"
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 text-white placeholder-slate-600 transition-colors"
                />
              </div>

              {/* Body */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Body Template</label>
                <textarea
                  rows={8}
                  value={bodyTemplate}
                  onChange={(e) => setBodyTemplate(e.target.value)}
                  placeholder="Compose your personalized template here..."
                  className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-violet-500 text-white placeholder-slate-600 font-mono transition-colors resize-y leading-relaxed"
                />
              </div>

              {/* Variable Cheatsheet */}
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-850 flex flex-col gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-violet-300">Detected Placeholders</h3>
                <p className="text-xs text-slate-400">These are parsed in real-time from your body template and automatically map to columns in the table below:</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {templatePlaceholders.length === 0 ? (
                    <span className="text-xs text-slate-500 italic">No placeholders detected. Type something like {"{{Name}}"} or {"{{Discount}}"} in the body template to define one.</span>
                  ) : (
                    templatePlaceholders.map((v) => (
                      <span
                        key={v}
                        onClick={() => {
                          // Append template block
                          setBodyTemplate(prev => prev + ` {{${v}}}`);
                        }}
                        className="text-xs font-mono px-2.5 py-1 rounded bg-slate-800 border border-slate-700 hover:border-violet-500 text-slate-300 cursor-pointer select-none transition-all"
                        title="Click to insert at end of body"
                      >
                        {`{{${v}}}`}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
            
          </div>

          {/* Right Columns - Influencer Grid */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            
            {/* Header list controls */}
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
              
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-850 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">Target Influencers ({influencers.length})</h2>
                  <p className="text-xs text-slate-400">Import excel/csv sheet or define list manually</p>
                </div>
                
                {/* Batch buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs cursor-pointer transition-all">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload CSV / XLSX</span>
                    <input
                      type="file"
                      accept=".csv, .xlsx, .xls"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={handleExportList}
                    disabled={influencers.length === 0}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs transition-all"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export</span>
                  </button>

                  <button
                    onClick={handleAddRow}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-900/60 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-750 rounded-lg text-xs transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Row</span>
                  </button>
                </div>
              </div>

              {/* Main editable spreadsheet style table & pagination wrapper */}
              <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-900">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email (Required)</TableHead>
                        <TableHead>Name</TableHead>
                        {/* Render other columns dynamically */}
                        {availableVariables.filter(v => v !== 'Email' && v !== 'Name').map((col) => (
                          <TableHead key={col}>{col}</TableHead>
                        ))}
                        <TableHead className="w-32">Send Status</TableHead>
                        <TableHead className="text-center w-12">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {influencers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={100} className="px-4 py-8 text-center text-slate-500">
                            No influencers loaded. Upload a sheet or add rows to get started!
                          </TableCell>
                        </TableRow>
                      ) : (
                        paginatedInfluencers.map((row, index) => {
                          const statusObj = sendStatuses[row.id];
                          return (
                            <TableRow
                              key={row.id}
                              className={
                                statusObj?.status === 'sending' ? 'bg-indigo-950/20' : ''
                              }
                            >
                              {/* Email field */}
                              <TableCell>
                                <input
                                  type="email"
                                  value={row.Email}
                                  onChange={(e) => handleCellEdit(row.id, 'Email', e.target.value)}
                                  className="bg-transparent border-0 hover:bg-slate-800 focus:bg-slate-800 focus:ring-1 focus:ring-violet-500 text-slate-200 rounded px-2 py-1 w-full text-xs font-mono focus:outline-none"
                                  placeholder="name@email.com"
                                />
                              </TableCell>
                              {/* Name field */}
                              <TableCell>
                                <input
                                  type="text"
                                  value={row.Name || ''}
                                  onChange={(e) => handleCellEdit(row.id, 'Name', e.target.value)}
                                  className="bg-transparent border-0 hover:bg-slate-800 focus:bg-slate-800 focus:ring-1 focus:ring-violet-500 text-slate-200 rounded px-2 py-1 w-full text-xs focus:outline-none"
                                  placeholder="Jane Doe"
                                />
                              </TableCell>
                              {/* Other custom attributes */}
                              {availableVariables.filter(v => v !== 'Email' && v !== 'Name').map((col) => (
                                <TableCell key={col}>
                                  <input
                                    type="text"
                                    value={row[col] || ''}
                                    onChange={(e) => handleCellEdit(row.id, col, e.target.value)}
                                    className="bg-transparent border-0 hover:bg-slate-800 focus:bg-slate-800 focus:ring-1 focus:ring-violet-500 text-slate-200 rounded px-2 py-1 w-full text-xs focus:outline-none"
                                    placeholder="Value"
                                  />
                                </TableCell>
                              ))}
                              {/* Status Indicator */}
                              <TableCell className="px-4">
                                {!statusObj || statusObj.status === 'idle' ? (
                                  <span className="text-slate-500">Idle</span>
                                ) : statusObj.status === 'sending' ? (
                                  <span className="text-indigo-400 flex items-center gap-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    <span>Sending...</span>
                                  </span>
                                ) : statusObj.status === 'success' ? (
                                  <span className="text-emerald-400 flex items-center gap-1 font-semibold">
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    <span>Sent</span>
                                  </span>
                                ) : (
                                  <span
                                    className="text-rose-400 flex items-center gap-1 font-semibold cursor-help"
                                    title={statusObj.error || 'Failed to send'}
                                  >
                                    <AlertCircle className="h-3.5 w-3.5" />
                                    <span>Failed</span>
                                  </span>
                                )}
                              </TableCell>
                              {/* Row Actions */}
                              <TableCell className="text-center">
                                <button
                                  onClick={() => handleRemoveRow(row.id)}
                                  className="text-slate-500 hover:text-rose-400 p-1.5 rounded transition-all"
                                  title="Remove influencer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                  </Table>
                </div>

                {/* Pagination Controls */}
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-950 px-6 py-3 border-t border-slate-850 text-xs text-slate-400">
                  <div>
                    Showing <span className="font-semibold text-slate-200">{influencers.length === 0 ? 0 : Math.min(influencers.length, (activeInfluencerPage - 1) * influencersRowsPerPage + 1)}</span> to{' '}
                    <span className="font-semibold text-slate-200">{Math.min(influencers.length, activeInfluencerPage * influencersRowsPerPage)}</span> of{' '}
                    <span className="font-semibold text-slate-200">{influencers.length}</span> influencers
                  </div>
                  
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span>Rows per page:</span>
                      <select
                        value={influencersRowsPerPage}
                        onChange={(e) => {
                          setInfluencersRowsPerPage(Number(e.target.value));
                          setInfluencersPage(1);
                        }}
                        className="bg-slate-900 border border-slate-800 rounded px-2 py-1 focus:outline-none focus:border-violet-500 text-slate-200 text-xs"
                      >
                        {[5, 10, 20, 50, 100].map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setInfluencersPage(1)}
                        disabled={activeInfluencerPage === 1}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-350 border border-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed font-semibold font-mono"
                        title="First Page"
                      >
                        &laquo;
                      </button>
                      <button
                        onClick={() => setInfluencersPage(prev => Math.max(1, prev - 1))}
                        disabled={activeInfluencerPage === 1}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-350 border border-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed font-medium text-xs"
                      >
                        Prev
                      </button>
                      <span className="px-2 py-1 text-slate-300">
                        Page {activeInfluencerPage} of {totalInfluencerPages}
                      </span>
                      <button
                        onClick={() => setInfluencersPage(prev => Math.min(totalInfluencerPages, prev + 1))}
                        disabled={activeInfluencerPage === totalInfluencerPages}
                        className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-350 border border-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed font-medium text-xs"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setInfluencersPage(totalInfluencerPages)}
                        disabled={activeInfluencerPage === totalInfluencerPages}
                        className="px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-350 border border-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed font-semibold font-mono"
                        title="Last Page"
                      >
                        &raquo;
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action sender row */}
              <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-2">
                <div className="text-xs text-slate-400">
                  {isSendingBatch ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 text-violet-400 animate-spin" />
                      <span>
                        {sendMode === 'sequential'
                          ? `Sending email ${currentSendingIndex !== null ? currentSendingIndex + 1 : 0} of ${influencers.length} sequentially...`
                          : `Sending ${influencers.length} emails in parallel (Burst Mode)...`}
                      </span>
                    </span>
                  ) : (
                    <span>Make sure your Mailpit sandbox SMTP is listening on port 1025.</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-slate-400">Send Mode:</span>
                    <select
                      value={sendMode}
                      disabled={isSendingBatch}
                      onChange={(e) => setSendMode(e.target.value as 'sequential' | 'burst')}
                      className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-violet-500 text-slate-200 disabled:opacity-40"
                    >
                      <option value="sequential">Sequential (500ms delay)</option>
                      <option value="burst">Burst (Parallel Send)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleSendOutreach}
                    disabled={isSendingBatch || influencers.length === 0}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:from-slate-800 disabled:to-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-all shadow-lg shadow-violet-900/20 w-full sm:w-auto"
                  >
                    {isSendingBatch ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Sending Campaign...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" />
                        <span>Start Outreach Campaign</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Persistence Section: Email History Log */}
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col gap-5">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-850 pb-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-indigo-400" />
              <div>
                <h2 className="text-lg font-semibold text-white">Email History Log</h2>
                <p className="text-xs text-slate-400">Database persistence layer showing what was sent, to whom, and status</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Status tabs */}
              <div className="flex rounded-lg bg-slate-900 p-0.5 border border-slate-800">
                {['ALL', 'SENT', 'FAILED'].map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setLogsStatusFilter(tab)}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      logsStatusFilter === tab
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Search filter */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  type="text"
                  value={logsSearchTerm}
                  onChange={(e) => setLogsSearchTerm(e.target.value)}
                  placeholder="Search recipient / subject..."
                  className="bg-slate-900 border border-slate-805 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition-colors w-56"
                />
              </div>

              {/* Refresh / Clear */}
              <button
                onClick={fetchLogs}
                disabled={isLoadingLogs}
                className="p-2 bg-slate-900 hover:bg-slate-850 text-slate-400 border border-slate-800 rounded-lg transition-all"
                title="Refresh logs"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoadingLogs ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={handleClearLogs}
                disabled={emailLogs.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-rose-950/40 hover:bg-rose-950/60 disabled:opacity-40 text-rose-350 border border-rose-900/60 rounded-lg text-xs transition-all"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear Logs</span>
              </button>
            </div>
          </div>

          {/* Logs Table & Pagination Wrapper */}
          <div className="border border-slate-850 rounded-xl overflow-hidden bg-slate-900">
            <div className="overflow-x-auto max-h-96">
              <Table>
                <TableHeader className="sticky top-0 z-10 bg-slate-950">
                  <TableRow>
                    <TableHead>Timestamp</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Recipient</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead className="w-28">Status</TableHead>
                    <TableHead>Error details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingLogs ? (
                    <TableRow>
                      <TableCell colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin text-violet-400" />
                          <span>Loading historical logs...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : filteredLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="px-4 py-8 text-center text-slate-500">
                        No logs found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="px-4 py-2.5 whitespace-nowrap text-slate-400 font-mono">
                          {new Date(log.sentAt).toLocaleString()}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 max-w-xs truncate" title={log.senderEmail}>
                          {log.senderEmail}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 max-w-xs truncate" title={log.recipientEmail}>
                          {log.recipientName ? `${log.recipientName} (${log.recipientEmail})` : log.recipientEmail}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 max-w-md truncate" title={log.subject}>
                          {log.subject}
                        </TableCell>
                        <TableCell className="px-4 py-2.5">
                          {log.status === 'SENT' ? (
                            <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-900 font-semibold text-[10px]">
                              SENT
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-900 font-semibold text-[10px]">
                              FAILED
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="px-4 py-2.5 text-rose-300 font-mono text-[11px] max-w-xs truncate" title={log.errorMessage || ''}>
                          {log.errorMessage || '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Logs Pagination Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-950 px-6 py-3 border-t border-slate-850 text-xs text-slate-400">
              <div>
                Showing <span className="font-semibold text-slate-200">{filteredLogs.length === 0 ? 0 : Math.min(filteredLogs.length, (activeLogPage - 1) * logsRowsPerPage + 1)}</span> to{' '}
                <span className="font-semibold text-slate-200">{Math.min(filteredLogs.length, activeLogPage * logsRowsPerPage)}</span> of{' '}
                <span className="font-semibold text-slate-200">{filteredLogs.length}</span> logs
              </div>
              
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <span>Rows per page:</span>
                  <select
                    value={logsRowsPerPage}
                    onChange={(e) => {
                      setLogsRowsPerPage(Number(e.target.value));
                      setLogsPage(1);
                    }}
                    className="bg-slate-900 border border-slate-800 rounded px-2 py-1 focus:outline-none focus:border-violet-500 text-slate-200 text-xs"
                  >
                    {[5, 10, 20, 50, 100].map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setLogsPage(1)}
                    disabled={activeLogPage === 1}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-350 border border-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed font-semibold font-mono"
                    title="First Page"
                  >
                    &laquo;
                  </button>
                  <button
                    onClick={() => setLogsPage(prev => Math.max(1, prev - 1))}
                    disabled={activeLogPage === 1}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-350 border border-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed font-medium text-xs"
                  >
                    Prev
                  </button>
                  <span className="px-2 py-1 text-slate-300">
                    Page {activeLogPage} of {totalLogPages}
                  </span>
                  <button
                    onClick={() => setLogsPage(prev => Math.min(totalLogPages, prev + 1))}
                    disabled={activeLogPage === totalLogPages}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-350 border border-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed font-medium text-xs"
                  >
                    Next
                  </button>
                  <button
                    onClick={() => setLogsPage(totalLogPages)}
                    disabled={activeLogPage === totalLogPages}
                    className="px-2 py-1 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-900 text-slate-350 border border-slate-800 rounded transition-all cursor-pointer disabled:cursor-not-allowed font-semibold font-mono"
                    title="Last Page"
                  >
                    &raquo;
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>
  );
}
