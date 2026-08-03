import type { Metadata } from 'next';
import { LegalArticle } from '../LegalArticle';

export const metadata: Metadata = {
  title: '隐私政策',
  description: 'Startup Graveyard 隐私政策：我们收集哪些数据、如何使用与保护，以及你的权利。',
  alternates: { canonical: '/legal/privacy' },
};

export default function PrivacyPage() {
  return (
    <LegalArticle title="隐私政策" updatedAt="2026-08-03">
      <p>
        本政策说明 Startup Graveyard（下称"本服务"）如何收集、使用与保护你的个人信息。
        我们遵循数据最小化原则：只收集提供服务所必需的数据。
      </p>

      <h2>1. 我们收集的信息</h2>
      <ul>
        <li>账户信息：邮箱、显示名称、加密存储的密码（bcrypt 哈希，不可逆）。</li>
        <li>
          会话信息：登录设备的 IP
          地址、浏览器标识（User-Agent）与活跃时间，用于设备会话管理与安全审计。
        </li>
        <li>使用数据：你创建的 Watchlist、保存视图、导出记录、Copilot 提问及回答。</li>
        <li>
          订阅信息：订阅层级、账单状态与 Stripe 客户标识。银行卡信息由 Stripe
          直接处理，我们不存储任何卡片数据。
        </li>
      </ul>

      <h2>2. Cookie 与凭据</h2>
      <p>
        我们使用 HttpOnly、Secure 的会话 Cookie 维持登录状态，页面脚本无法读取。
        我们不使用第三方广告或跟踪 Cookie。
      </p>

      <h2>3. 数据如何被使用</h2>
      <ul>
        <li>提供与改进核心功能（检索、研究资产、团队协作）。</li>
        <li>安全目的：限流、异常登录识别、审计与滥用防护。</li>
        <li>
          事务性通知：密码重置、订阅与账单状态变更等必要邮件；我们不发送营销邮件，除非你明确订阅。
        </li>
      </ul>

      <h2>4. 第三方处理方</h2>
      <ul>
        <li>Stripe：订阅支付与账单管理。</li>
        <li>
          AI 提供商（OpenAI / Anthropic）：处理你的 Copilot
          提问以生成回答；提问内容会连同相关案例上下文发送给所配置的提供商。
        </li>
        <li>邮件服务（SMTP）：投递事务性邮件。</li>
      </ul>
      <p>我们不会向任何第三方出售你的个人信息。</p>

      <h2>5. 数据保留与删除</h2>
      <ul>
        <li>账户数据在账户存续期间保留；密码重置令牌以摘要形式短期存储并在使用后立即失效。</li>
        <li>
          你可以随时撤销设备会话；删除账户可通过联系我们发起，我们将在合理期限内删除或匿名化相关个人数据（法律要求保留的账单记录除外）。
        </li>
      </ul>

      <h2>6. 数据安全</h2>
      <p>
        我们采用传输加密（HTTPS）、凭据哈希存储、最小权限访问、速率限制与审计日志等措施保护数据。
        如发生影响你权益的数据安全事件，我们将及时通知。
      </p>

      <h2>7. 你的权利</h2>
      <p>
        你有权访问、更正、导出或删除你的个人数据。大部分操作可在账户页自助完成； 其余请求请通过仓库
        SECURITY 文档中的联系方式提交，我们将在合理期限内响应。
      </p>

      <h2>8. 政策更新</h2>
      <p>
        我们更新本政策时会修改"最近更新"日期，重大变更将通过站内或邮件通知。
        继续使用本服务即表示你接受更新后的政策。
      </p>

      <p style={{ color: '#6b7ca8' }}>
        说明：本政策为产品预发布（alpha）版本，正式商用前将根据实际部署地区的合规要求 （如
        GDPR、CCPA、个人信息保护法）经法律顾问审阅并更新。
      </p>
    </LegalArticle>
  );
}
