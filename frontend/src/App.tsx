import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { I18nHtmlLang } from '@/i18n/I18nHtmlLang'
import { AppShell } from '@/layout/AppShell'
import { AdminShell } from '@/layout/AdminShell'
import { LoginLegacyRedirect } from '@/auth/LoginLegacyRedirect'
import { RequireAuth } from '@/auth/RequireAuth'
import { RequireAdmin } from '@/auth/RequireAdmin'
import { LandingLayout } from '@/landing/LandingLayout'
import { LandingSessionProvider } from '@/landing/LandingSessionContext'
import { HomePage } from '@/pages/HomePage'
import { WeChatOAuthCallbackPage } from '@/pages/WeChatOAuthCallbackPage'
import { UsagePage } from '@/pages/UsagePage'
import { ApiKeysPage } from '@/pages/ApiKeysPage'
import { PlansPage } from '@/pages/PlansPage'
import { ContactPage } from '@/pages/ContactPage'
import { InvitationPage } from '@/pages/InvitationPage'
import { PartnersPage } from '@/pages/PartnersPage'
import { AiChatPage } from '@/pages/AiChatPage'
import { ModelSquarePage } from '@/pages/ModelSquarePage'
import { BillingPage } from '@/pages/BillingPage'
import { RechargePage } from '@/pages/RechargePage'
import { ProfilePage } from '@/pages/ProfilePage'
import { CommissionWithdrawPage } from '@/pages/CommissionWithdrawPage'
import { WechatMerchantConfirmPage } from '@/pages/WechatMerchantConfirmPage'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminSystemConfigPage } from '@/pages/admin/AdminSystemConfigPage'
import { AdminAgentLevelsPage } from '@/pages/admin/AdminAgentLevelsPage'
import { AdminPackageMgmtPage } from '@/pages/admin/AdminPackageMgmtPage'
import { DocsLayout } from '@/pages/docs/DocsLayout'
import { ApiDocsPage } from '@/pages/ApiDocsPage'
import { PartnerRulesDocPage } from '@/pages/docs/PartnerRulesDocPage'
import { FeatureConceptDocPage } from '@/pages/docs/FeatureConceptDocPage'
import { DevTokenLoginFloat } from '@/components/DevTokenLoginFloat'

export default function App() {
  const consoleRoutes = [
    'usage',
    'api-keys',
    'plans',
    'ai-chat',
    'billing',
    'recharge',
    'invitations',
    'profile',
    'commission-withdrawal',
  ] as const

  return (
    <>
      <I18nHtmlLang />
      <Routes>
        <Route
          element={
            <LandingSessionProvider>
              <Outlet />
            </LandingSessionProvider>
          }
        >
          <Route element={<LandingLayout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/models" element={<ModelSquarePage />} />
            <Route path="/partners" element={<PartnersPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/docs" element={<DocsLayout />}>
              <Route index element={<ApiDocsPage />} />
              <Route path="self-built" element={<FeatureConceptDocPage topic="selfBuilt" />} />
              <Route path="hardcore" element={<FeatureConceptDocPage topic="hardcore" />} />
              <Route path="cost-performance" element={<FeatureConceptDocPage topic="costPerf" />} />
              <Route path="unified" element={<Navigate to="self-built" replace />} />
              <Route path="latency" element={<Navigate to="hardcore" replace />} />
              <Route path="pricing" element={<Navigate to="cost-performance" replace />} />
              <Route path="privacy" element={<FeatureConceptDocPage topic="privacy" />} />
              <Route path="partner-rules" element={<PartnerRulesDocPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="/login" element={<LoginLegacyRedirect />} />
        <Route path="/auth/wechat/callback" element={<WeChatOAuthCallbackPage />} />
        <Route path="/wechat-confirm" element={<WechatMerchantConfirmPage />} />
        <Route
          path="/console"
          element={
            <RequireAuth>
              <AppShell />
            </RequireAuth>
          }
        >
          <Route index element={<Navigate to="usage" replace />} />
          <Route path="usage" element={<UsagePage />} />
          <Route path="api-keys" element={<ApiKeysPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="ai-chat" element={<AiChatPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="recharge" element={<RechargePage />} />
          <Route path="invitations" element={<InvitationPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="commission-withdrawal" element={<CommissionWithdrawPage />} />
        </Route>
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminShell />
            </RequireAdmin>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboardPage />} />
          <Route path="system" element={<AdminSystemConfigPage />} />
          <Route path="agent-levels" element={<AdminAgentLevelsPage />} />
          <Route path="packages" element={<AdminPackageMgmtPage />} />
        </Route>
        {consoleRoutes.map((seg) => (
          <Route key={seg} path={`/${seg}`} element={<Navigate to={`/console/${seg}`} replace />} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <DevTokenLoginFloat />
    </>
  )
}
