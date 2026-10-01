import { BrowserRouter, Route, Routes } from 'react-router-dom'
import Chrome from './components/Chrome'
import LandingPage from './pages/LandingPage'
import { NotFoundPage, PrivacyPage, TermsPage } from './pages/LegalPages'
import ReceiptPage from './pages/ReceiptPage'
import RunsPage from './pages/RunsPage'
import UploadPage from './pages/UploadPage'
import AccuracySheet from './pages/report/AccuracySheet'
import ChecksSheet from './pages/report/ChecksSheet'
import EventsSheet from './pages/report/EventsSheet'
import IncidentsSheet from './pages/report/IncidentsSheet'
import OverviewSheet from './pages/report/OverviewSheet'
import ReportLayout from './pages/report/ReportLayout'
import SummarySheet from './pages/report/SummarySheet'
import ViewsSheet from './pages/report/ViewsSheet'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Chrome />}>
          <Route index element={<LandingPage />} />
          <Route path="upload" element={<UploadPage />} />
          <Route path="runs" element={<RunsPage />} />
          <Route path="runs/:runId/receipt" element={<ReceiptPage />} />
          <Route path="runs/:runId" element={<ReportLayout />}>
            <Route index element={<OverviewSheet />} />
            <Route path="views" element={<ViewsSheet />} />
            <Route path="incidents" element={<IncidentsSheet />} />
            <Route path="events" element={<EventsSheet />} />
            <Route path="checks" element={<ChecksSheet />} />
            <Route path="accuracy" element={<AccuracySheet />} />
            <Route path="summary" element={<SummarySheet />} />
          </Route>
          <Route path="terms" element={<TermsPage />} />
          <Route path="privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
