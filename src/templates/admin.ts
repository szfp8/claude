import { escapeHtml } from './layout'
import { renderSafeSvgImage } from './public'
import type { PlatformConfig } from '../utils/socialPlatforms'
import { DEFAULT_AI_GLOBAL_PROMPT, DEFAULT_AI_PROMPTS, AI_PROMPT_SPECS, AI_TITLE_GENERATION_GUIDES, promptTextStats, validateAiPromptVariables, type AiPromptKey, type AiPromptSettings } from '../utils/aiPrompts'
import type { SeoAuditPage, SeoAuditResult } from '../utils/seoAudit'
import type { PageContactMethods } from '../utils/pageContacts'
import { getSiteProfile } from '../utils/siteProfile'

const NAV = [
  { group: '运营', href: '/admin', label: '数据概览', icon: '📊' },
  { group: '运营', href: '/admin/articles', label: '内容管理', pageKey: 'articles', icon: '📰' },
  { group: '运营', href: '/admin/social', label: '国内内容分发', icon: '📣' },
  { group: '运营', href: '/admin/news-sources', label: '新闻采集', icon: '📡' },
  { group: 'SEO', href: '/admin/keywords', label: '关键词矩阵', icon: '🔎' },
  { group: 'SEO', href: '/admin/cities', label: '城市管理', pageKey: 'cities', icon: '📍' },
  { group: 'SEO', href: '/admin/services', label: '服务管理', pageKey: 'services', icon: '🧾' },
  { group: 'SEO', href: '/admin/subprojects', label: '子项目管理', icon: '🏷️' },
  { group: 'SEO', href: '/admin/seo', label: 'SEO / 推送', icon: '🚀' },
  { group: 'SEO', href: '/admin/geo', label: 'GEO / AI搜索', icon: '🧭' },
  { group: 'AI', href: '/admin/ai-settings', label: 'AI 设置', icon: '🤖' },
  { group: 'AI', href: '/admin/ai-prompts', label: 'AI 提示词', icon: '🧠' },
  { group: '资源', href: '/admin/media', label: 'R2 媒体库', icon: '🖼️' },
  { group: '资源', href: '/admin/pages', label: '页面管理', icon: '📄' },
  { group: '资源', href: '/admin/modules', label: '站点模块', icon: '🧩' },
  { group: '客户', href: '/admin/messages', label: '客户留言', icon: '💬' },
  { group: '系统', href: '/admin/users', label: '管理用户', icon: '👤' },
  { group: '系统', href: '/admin/system', label: '系统自检', icon: '🩺' },
  { group: '系统', href: '/admin/settings', label: '系统设置', icon: '⚙️' },
]

export function renderWechatEditor(article: any, cityName: string, wechatHtml: string): string {
  const statusLabel: Record<string, string> = {
    not_synced: '未生成', ready: '已生成', copied: '已复制', scheduled: '已排期（手动提醒）',
  }
  const scheduledValue = article.wechat_scheduled_at ? String(article.wechat_scheduled_at).slice(0, 16) : ''
  return renderAdminLayout({
    title: '微信排版', active: '/admin/articles',
    body: `
    <div class="section-title">
      <h2>微信排版 · ${escapeHtml(article.title)}</h2>
      <a href="/admin/articles" style="color:var(--muted);font-size:13px">← 返回内容管理</a>
    </div>
    <p style="color:var(--muted);font-size:13px;margin-bottom:20px">
      当前状态：<span class="badge">${statusLabel[article.wechat_status] || '未生成'}</span>
      　尚未接入微信公众号 API，这里生成排版内容供"一键复制"到公众号图文编辑器手动粘贴发布；
      预约时间只作为你自己安排用的提醒，不会自动发布，接入方式见代码注释（<code>utils/wechatFormat.ts</code>）。
    </p>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
      <div>
        <form class="admin-form" method="post" action="/admin/articles/${article.id}/wechat">
          <label>微信标题（留空则用官网标题：${escapeHtml(article.title)}）</label>
          <input name="wechat_title" value="${escapeHtml(article.wechat_title || '')}" />

          <label>微信摘要（建议120字以内，公众号列表页展示用，留空则用官网摘要）</label>
          <textarea name="wechat_summary" rows="2" placeholder="${escapeHtml(article.summary || '')}">${escapeHtml(article.wechat_summary || '')}</textarea>

          <label>封面图片地址（微信要求真实图片URL；建议先传到公众号"素材库"或图床，再把地址粘贴到这里；暂不支持在此直接上传）</label>
          <input name="wechat_cover_url" value="${escapeHtml(article.wechat_cover_url || '')}" placeholder="https://..." />

          <label>预约发布时间（仅供自己提醒，不会自动发布）</label>
          <input type="datetime-local" name="wechat_scheduled_at" value="${escapeHtml(scheduledValue)}" />

          <button class="btn" type="submit">保存并生成排版</button>
        </form>

        <div class="card" style="margin-top:16px">
          <h3 style="margin-top:0">SEO关键词 / 城市标签（只读，来自"编辑文章"页的SEO设置）</h3>
          <p style="font-size:13px;color:var(--muted);margin:6px 0">城市标签：${escapeHtml(cityName)}</p>
          <p style="font-size:13px;color:var(--muted);margin:6px 0">
            关键词：${article.seo_keywords ? escapeHtml(article.seo_keywords) : '未设置，可回到「编辑文章」页补充'}
          </p>
        </div>
      </div>

      <div>
        <h3 style="margin-top:0">预览（下面的内容就是复制后粘贴到公众号编辑器的效果）</h3>
        ${article.wechat_cover_url ? `<img src="${escapeHtml(article.wechat_cover_url)}" style="width:100%;border-radius:8px;margin-bottom:12px;display:block" />` : ''}
        <div id="wechatPreview" class="card" style="max-height:460px;overflow:auto">
          ${wechatHtml}
        </div>
        <button class="btn" style="margin-top:12px;background:#07c160" onclick="copyWechatContent()">✅ 一键复制（可直接粘贴到公众号编辑器）</button>
        <p style="font-size:12px;color:var(--muted);margin-top:8px">复制的是正文排版；标题、摘要、封面微信要求分别填在编辑器对应的输入框里，无法通过粘贴一起带过去。</p>
      </div>
    </div>

    <script>
    function copyWechatContent(){
      const el = document.getElementById('wechatPreview');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try {
        document.execCommand('copy');
        fetch(window.location.pathname + '/mark-copied', { method: 'POST' }).catch(function(){});
        alert('已复制！打开公众号后台的图文消息编辑器，光标点进正文区域后 Ctrl+V / Cmd+V 粘贴即可。');
      } catch (e) {
        alert('复制失败，请手动选中预览区域内容后按 Ctrl+C');
      }
      sel.removeAllRanges();
    }
    </script>
  `,
  })
}

const STATUS_LABEL: Record<string, string> = {
  not_synced: '未生成', ready: '已生成', copied: '已复制', scheduled: '已排期（手动提醒）',
}

// ---- 多平台分发汇总页：一个文章对应抖音/快手/小红书/哔哩哔哩四张卡片 ----
export function renderSocialHub(article: any, platforms: PlatformConfig[], posts: Record<string, any>): string {
  return renderAdminLayout({
    title: '多平台分发', active: '/admin/articles',
    body: `
    <div class="section-title">
      <h2>多平台分发 · ${escapeHtml(article.title)}</h2>
      <a href="/admin/articles" style="color:var(--muted);font-size:13px">← 返回内容管理</a>
    </div>
    <p style="color:var(--muted);font-size:13px;margin-bottom:20px">
      国内内容/视频平台默认生成“发布包”：AI生成标题、正文/口播、话题与必要排版，保存到 CMS 后再按平台官方授权方式发布；模板不保存平台账号密码，也不在未授权情况下代发。
      微信排版是独立入口，见内容管理列表里的"微信排版"链接。
    </p>
    <div class="grid grid-4">
      ${platforms.map((p) => {
        const post = posts[p.key]
        const status = post?.status || 'not_synced'
        return `
        <a class="card" href="/admin/articles/${article.id}/social/${p.key}" style="border-top:3px solid ${p.color}">
          <h3>${p.icon} ${p.label}</h3>
          <p style="margin-top:8px"><span class="badge">${STATUS_LABEL[status]}</span></p>
          <p style="margin-top:8px;color:var(--muted);font-size:12px">${escapeHtml(p.helpText)}</p>
        </a>`
      }).join('')}
    </div>
    <script>
    document.querySelectorAll('.prompt-var-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        const target = document.getElementById(btn.getAttribute('data-target') || '');
        if (!target) return;
        const value = btn.getAttribute('data-value') || '';
        const start = target.selectionStart == null ? target.value.length : target.selectionStart;
        const end = target.selectionEnd == null ? target.value.length : target.selectionEnd;
        target.value = target.value.slice(0, start) + value + target.value.slice(end);
        target.focus();
        const pos = start + value.length;
        target.setSelectionRange(pos, pos);
      });
    });
    </script>
  `,
  })
}

// ---- 单平台编辑/预览/复制页 ----
export function renderSocialDistributionPage(rows: any[], platforms: PlatformConfig[]): string {
  const statusLabel: Record<string, string> = { not_synced: '未生成', ready: '待人工发布', copied: '已复制', scheduled: '已排期' }
  return renderAdminLayout({
    title: '国内内容分发', active: '/admin/social',
    body: `
    <div class="section-title"><h2>📣 国内内容分发</h2><a href="/admin/articles">内容管理 →</a></div>
    <p class="admin-help">官网文章人工发布后，系统自动生成四个平台的发布包。此页用于统一查看状态并进入编辑。</p>
    <div class="grid grid-4" style="margin-bottom:16px">
      ${platforms.map((p) => '<div class="card"><strong>' + p.icon + ' ' + escapeHtml(p.label) + '</strong><p style="font-size:12px;color:var(--muted);margin:6px 0">' + escapeHtml(p.helpText) + '</p><span class="badge">' + escapeHtml(p.copyMode === 'richtext' ? '富文本复制' : '纯文本复制') + '</span></div>').join('')}
    </div>
    <div class="card">
      <h3 style="margin-top:0">已发布文章的发布包</h3>
      <div class="admin-table-wrap">
        <table>
          <thead><tr><th>文章</th><th>发布时间</th><th>抖音</th><th>快手</th><th>小红书</th><th>哔哩哔哩</th><th>操作</th></tr></thead>
          <tbody>
          ${rows.length ? rows.map((row) => {
            const cell = (key: string) => '<span class="badge">' + escapeHtml(statusLabel[String(row[key] || 'not_synced')]) + '</span>'
            return '<tr><td><strong>' + escapeHtml(row.title || '') + '</strong></td><td>' + escapeHtml(row.published_at || '') + '</td><td>' + cell('douyin_status') + '</td><td>' + cell('kuaishou_status') + '</td><td>' + cell('xiaohongshu_status') + '</td><td>' + cell('bilibili_status') + '</td><td><a class="btn secondary" href="/admin/articles/' + encodeURIComponent(String(row.id)) + '/social">打开发布包</a></td></tr>'
          }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:28px">暂无已发布文章</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    `
  })
}

export function renderSocialEditor(article: any, config: PlatformConfig, post: any, copyPayload: string): string {
  const status = post?.status || 'not_synced'
  const hashtags = post?.hashtags || ''
  const isRich = config.copyMode === 'richtext'
  return renderAdminLayout({
    title: `${config.label}分发`, active: '/admin/articles',
    body: `
    <div class="section-title">
      <h2>${config.icon} ${config.label} · ${escapeHtml(article.title)}</h2>
      <a href="/admin/articles/${article.id}/social" style="color:var(--muted);font-size:13px">← 返回多平台分发</a>
    </div>
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px">
      状态：<span class="badge">${STATUS_LABEL[status]}</span>　${escapeHtml(config.helpText)}
    </p>

    <form method="post" action="/admin/articles/${article.id}/social/${config.key}/generate" style="margin-bottom:16px">
      <button class="btn secondary" type="submit">${post ? '🔄 用AI重新生成' : '✨ 用AI生成文案'}</button>
    </form>

    ${post ? `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start">
      <div>
        <form class="admin-form" method="post" action="/admin/articles/${article.id}/social/${config.key}">
          <label>标题</label>
          <input name="title" value="${escapeHtml(post.title || '')}" />
          <label>正文</label>
          <textarea name="content" rows="10">${escapeHtml(post.content || '')}</textarea>
          <label>话题标签（逗号分隔，不用带#号）</label>
          <input name="hashtags" value="${escapeHtml(hashtags)}" />
          <label>预约发布时间（仅自己提醒，不会自动发布）</label>
          <input type="datetime-local" name="scheduled_at" value="${escapeHtml((post.scheduled_at || '').slice(0, 16))}" />
          <button class="btn" type="submit">保存</button>
        </form>
      </div>
      <div>
        <h3 style="margin-top:0">预览（复制后粘贴到${config.label}${isRich ? '编辑器' : '发布框'}）</h3>
        <div id="socialPreview" class="card" style="max-height:460px;overflow:auto;white-space:${isRich ? 'normal' : 'pre-wrap'}">${copyPayload}</div>
        <button class="btn" style="margin-top:12px;background:${config.color}" onclick="copySocialContent()">✅ 一键复制</button>
      </div>
    </div>
    <script>
    function copySocialContent(){
      const el = document.getElementById('socialPreview');
      const range = document.createRange();
      range.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      try {
        document.execCommand('copy');
        fetch(window.location.pathname + '/mark-copied', { method: 'POST' }).catch(function(){});
        alert('已复制！打开${config.label} App/创作后台粘贴即可。');
      } catch (e) {
        alert('复制失败，请手动选中预览区域内容后按 Ctrl+C');
      }
      sel.removeAllRanges();
    }
    </script>
    ` : `<p style="color:var(--muted)">还没有生成过内容，点上面的按钮用 AI 生成一份草稿。</p>`}
  `,
  })
}

export function renderMediaPage(rows: any[], total: number | string = rows.length, error = ''): string {
  return renderAdminLayout({
    title: 'R2 媒体库', active: '/admin/media',
    body: `
    <div class="section-title">
      <div>
        <h2>R2 媒体库</h2>
        <p style="margin:4px 0 0;color:var(--muted);font-size:13px">
          R2 中当前列出 <strong>${escapeHtml(String(total))}</strong> 个媒体文件（历史 R2 文件也会显示；当前页面最多显示 1000 个）。
          删除会直接从 Cloudflare R2 删除；如果文件被首页、城市、服务或微信二维码引用，系统会同时解除引用，不保留回收站。
        </p>
      </div>
    </div>
    ${error ? '<div class="card" style="border-left:4px solid #e5484d;color:#c92a2a;margin-bottom:16px">' + escapeHtml(error) + '</div>' : ''}
    <form class="admin-form" method="post" action="/admin/media/upload" enctype="multipart/form-data">
      <label>上传文件（单文件最大 10MB）</label>
      <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml,application/pdf" required />
      <button class="btn" type="submit">上传到 R2</button>
    </form>

    <form method="post" action="/admin/media/delete-selected" id="mediaDeleteForm">
      <div class="admin-actions" style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:20px">
        <div style="color:var(--muted);font-size:12px">
          <label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="mediaSelectAll" /> 全选当前显示文件
          </label>
          <span id="mediaSelectedCount" style="margin-left:10px">已选 0 个</span>
        </div>
        <button class="btn secondary" type="submit" id="mediaDeleteSelected" disabled onclick="return confirm('确认永久删除选中的 R2 文件？删除后不可恢复。')">删除选中</button>
      </div>
      <div class="admin-table-wrap">
        <table style="margin-top:10px">
          <thead><tr><th style="width:44px">选择</th><th>预览</th><th>文件</th><th>类型</th><th>大小</th><th>上传时间</th><th>地址</th><th>操作</th></tr></thead>
          <tbody>
          ${rows.length ? rows.map((r) => {
            const objectKey = String(r.object_key || '')
            const publicUrl = '/media/' + objectKey.slice('media/'.length)
            const type = String(r.content_type || '')
            const size = r.size >= 1024 * 1024 ? (r.size / 1024 / 1024).toFixed(2) + ' MB' : Math.max(1, Math.round(Number(r.size || 0) / 1024)) + ' KB'
            const preview = type.startsWith('image/') ? `<a href="${publicUrl}" target="_blank" rel="noopener noreferrer"><img src="${publicUrl}" alt="" loading="lazy" width="72" height="54" style="width:72px;height:54px;object-fit:contain;background:#f6f8fb;border:1px solid #e5eaf0;border-radius:6px;display:block" /></a>` : '<span style="color:var(--muted);font-size:12px">非图片</span>'
            return `<tr>
              <td><input class="media-select" type="checkbox" name="keys" value="${escapeHtml(objectKey)}" /></td>
              <td>${preview}</td>
              <td>${escapeHtml(r.original_name || objectKey.split('/').pop() || objectKey)}${r.r2_only ? '<br><small style="color:#8a98aa">历史R2文件</small>' : ''}</td>
              <td>${escapeHtml(type || '未知')}</td>
              <td>${size}</td>
              <td>${escapeHtml(r.uploaded_at || '')}</td>
              <td><a href="${publicUrl}" target="_blank" rel="noopener noreferrer">打开</a></td>
              <td>
                <button class="btn secondary" type="button" onclick="copyUrl('${publicUrl}')">复制地址</button>
                <button class="btn secondary" type="button" style="color:#e5484d" onclick="deleteOneMedia('${escapeHtml(objectKey).replace(/'/g, '&#39;')}')">删除</button>
              </td>
            </tr>`
          }).join('') : '<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:28px">R2 暂无媒体文件</td></tr>'}
          </tbody>
        </table>
      </div>
    </form>

    <script>
      function copyUrl(path){
        navigator.clipboard.writeText(new URL(path, location.origin).href)
          .then(function(){ alert('地址已复制'); })
          .catch(function(){ prompt('复制下面地址', new URL(path, location.origin).href); });
      }
      function deleteOneMedia(path){
        if(!confirm('确认永久删除这个 R2 文件？删除后不可恢复。')) return;
        var form=document.createElement('form');
        form.method='post';
        form.action='/admin/media/delete-one';
        form.style.display='none';
        var input=document.createElement('input');
        input.type='hidden';
        input.name='object_key';
        input.value=path;
        form.appendChild(input);
        document.body.appendChild(form);
        form.submit();
      }
      (function(){
        var all=document.getElementById('mediaSelectAll');
        var button=document.getElementById('mediaDeleteSelected');
        var count=document.getElementById('mediaSelectedCount');
        if(!all||!button||!count) return;
        function refresh(){
          var selected=document.querySelectorAll('.media-select:checked').length;
          var boxes=document.querySelectorAll('.media-select').length;
          count.textContent='已选 '+selected+' 个';
          button.disabled=selected===0;
          all.checked=boxes>0 && selected===boxes;
          all.indeterminate=selected>0 && selected<boxes;
        }
        all.addEventListener('change',function(){
          document.querySelectorAll('.media-select').forEach(function(el){ el.checked=all.checked; });
          refresh();
        });
        document.querySelectorAll('.media-select').forEach(function(el){ el.addEventListener('change',refresh); });
        refresh();
      })();
    </script>
  `,
  })
}

export function renderAdminUsersPage(rows: any[], error?: string): string {
  const u = rows[0]
  return renderAdminLayout({
    title: '管理员账号', active: '/admin/users',
    body: `
    <div class="section-title"><h2>管理员账号</h2></div>
    <p style="color:var(--muted);font-size:13px;line-height:1.8">系统默认仅允许一个管理员。这里修改登录邮箱和密码；忘记密码时不要删除管理员，直接使用登录页“忘记密码？”并输入首次部署时保存的 <strong>SETUP_TOKEN</strong> 恢复。SETUP_TOKEN 不显示在后台，必须到 Cloudflare Worker → Settings → Variables and Secrets 中查看或更新。</p>
    ${error ? `<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px">${escapeHtml(error)}</div>` : ''}
    ${u ? `
    <div class="card">
      <h3>唯一管理员</h3>
      <form method="post" action="/admin/users/${u.id}/edit" class="admin-form">
        <label>登录邮箱</label>
        <input type="email" name="email" value="${escapeHtml(u.email)}" required />
        <input type="hidden" name="role" value="admin" />
        <label>新密码（留空不修改）</label>
        <input type="password" name="password" placeholder="至少 10 位，含两类字符" minlength="10" maxlength="128" autocomplete="new-password" />
        <button class="btn" type="submit">保存管理员账号</button>
      </form>
      <p style="margin:12px 0 0;color:var(--muted);font-size:12px">恢复入口：<a href="/admin/recover">忘记密码 / 使用 SETUP_TOKEN 恢复</a></p>
    </div>
    ` : '<p>尚未创建管理员，请先完成首次初始化。</p>'}
  `,
  })
}

export function renderSystemPage(checks: { label: string; ok: boolean; detail: string }[]): string {
  return renderAdminLayout({
    title: '系统自检', active: '/admin/system',
    body: `
    <h2>系统自检</h2>
    <p style="color:var(--muted);font-size:13px">默认只检查绑定是否存在；点击下面按钮才会执行一次真实的 KV / R2 / Workers AI 读写测试，避免反复刷新后台消耗资源。</p>
    <p><a class="btn" href="/admin/system?probe=1">执行完整检测（KV + R2 + AI）</a></p>
    <div class="card" style="margin:16px 0;border-left:4px solid #ff9f1a">
      <h3 style="margin-top:0">生产库 / D1 / R2 / KV 同步清理</h3>
      <p style="color:var(--muted);font-size:13px;line-height:1.8">按模块删除生产数据和关联资源。D1 每次最多处理 25 条，R2 每次最多删除 25 个对象，KV 每次最多删除 25 个 key；浏览器自动继续。所有所选模块处理完后只执行一次 Worker 全局缓存失效，避免 Free 版 5 次/分钟的 purge 限流。KV 只清理本应用临时缓存和健康检查探针，<strong>不会删除管理员登录密钥</strong>。</p>
      <div style="display:flex;gap:14px;flex-wrap:wrap;margin:12px 0">
        <label><input type="checkbox" name="cleanup_scope" value="articles" /> 内容/文章</label>
        <label><input type="checkbox" name="cleanup_scope" value="news" /> 新闻采集源 + AI新闻</label>
        <label><input type="checkbox" name="cleanup_scope" value="cities" /> 城市</label>
        <label><input type="checkbox" name="cleanup_scope" value="services" /> 服务项目</label>
        <label><input type="checkbox" name="cleanup_scope" value="keywords" /> SEO关键词/落地页</label>
        <label><input type="checkbox" name="cleanup_scope" value="r2" /> R2全部媒体资产</label>
        <label><input type="checkbox" name="cleanup_scope" value="kv" /> KV临时缓存</label>
        <label style="font-weight:700"><input type="checkbox" id="cleanupAllScope" /> 全站生产内容 + R2 + 临时KV</label>
      </div>
      <button class="btn" type="button" id="productionCleanupBtn">开始同步清理</button>
      <span id="productionCleanupStatus" style="margin-left:10px;color:var(--muted);font-size:13px"></span>
    </div>
    <script>
    (function(){
      var btn=document.getElementById("productionCleanupBtn");
      var status=document.getElementById("productionCleanupStatus");
      var all=document.getElementById("cleanupAllScope");
      if(!btn||!status||!all) return;
      all.addEventListener("change",function(){
        document.querySelectorAll('input[name="cleanup_scope"]').forEach(function(el){ el.checked=false; el.disabled=all.checked; });
      });
      async function runScope(scope){
        var phase="d1", cursor="";
        while(true){
          var form=new URLSearchParams(); form.set("scope",scope); form.set("phase",phase); form.set("cursor",cursor);
          var response=await fetch("/admin/production-cleanup",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},credentials:"same-origin",body:form.toString()});
          var data=await response.json().catch(function(){ return {ok:false,error:"服务器返回无效JSON"}; });
          if(!response.ok||!data.ok) throw new Error(data.error||"生产资源清理失败");
          if(data.deleted&&typeof data.deleted==="object"){ status.textContent=scope+"：D1 已处理"; }
          else if(data.deleted){ status.textContent=scope+"：已删除 "+data.deleted+" 项"; }
          else { status.textContent=scope+"：正在清理…"; }
          if(data.complete) return;
          phase=data.nextPhase||phase;
          cursor=data.nextCursor||"";
        }
      }
      btn.addEventListener("click",async function(){
        var scopes=[];
        if(all.checked) scopes=["all"];
        else document.querySelectorAll('input[name="cleanup_scope"]:checked').forEach(function(el){ scopes.push(el.value); });
        if(!scopes.length){ status.textContent="请先选择清理范围"; return; }
        if(!confirm(all.checked ? "确定清理全站生产内容、SEO关键词、城市、服务、新闻、R2媒体和临时KV缓存？管理员账号与站点基础配置会保留，删除不可恢复。" : "确定删除所选生产数据及关联资源？删除不可恢复。")) return;
        btn.disabled=true; status.textContent="同步清理开始…";
        try{
          for(var i=0;i<scopes.length;i++){ await runScope(scopes[i]); }
          await runScope("cache");
          status.textContent="清理完成：D1 / R2 / KV 已同步处理，公开缓存已全部失效。";
          setTimeout(function(){ location.reload(); },900);
        }catch(err){ status.textContent="清理中断："+(err&&err.message?err.message:err); btn.disabled=false; }
      });
    })();
    </script>
    <table>
      <thead><tr><th>检查项</th><th>状态</th><th>说明</th></tr></thead>
      <tbody>
      ${checks.map((c) => `<tr>
        <td>${escapeHtml(c.label)}</td>
        <td>${(c as any).level === 'warning'
          ? '<span class="badge" style="background:#fff6db;color:#9a6700">警告</span>'
          : c.ok
            ? '<span class="badge" style="background:#e7f7ee;color:#1a8a4e">正常</span>'
            : '<span class="badge" style="background:#fdeaea;color:#e5484d">异常</span>'}</td>
        <td style="max-width:420px;word-break:break-all">${escapeHtml(c.detail)}</td>
      </tr>`).join('')}
      </tbody>
    </table>
  `,
  })
}

export function renderAdminLayout(opts: { title: string; active: string; body: string }): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(opts.title)} - 后台管理</title>
<link rel="stylesheet" href="/styles.css" />
</head>
<body class="admin-page">
<div class="admin-shell">
  <div class="admin-mobile-header">
    <button type="button" class="admin-hamburger" onclick="toggleAdminMenu(true)" aria-label="打开菜单" aria-controls="adminSidebar" aria-expanded="false">☰</button>
    <span>◈ 白标 CMS 后台</span>
    <a href="/admin/logout" class="admin-mobile-logout">退出</a>
  </div>
  <div id="adminOverlay" class="admin-overlay" onclick="toggleAdminMenu(false)"></div>
  <aside id="adminSidebar" class="admin-sidebar" aria-label="后台导航">
    <div class="admin-brand">◈ <span>白标 CMS 后台</span></div>
    <nav class="admin-sidebar-nav">
      ${(() => {
        let last = ''
        return NAV.map((n) => {
          const heading = n.group !== last ? `<div class="admin-nav-group-title">${escapeHtml(n.group)}</div>` : ''
          last = n.group
          const active = opts.active === n.href ? 'active' : ''
          return heading + `<a class="admin-nav-link ${active}" href="${n.href}"${n.pageKey ? ` data-page-key="${n.pageKey}"` : ''}><span class="admin-nav-icon">${n.icon}</span><span class="admin-nav-label">${escapeHtml(n.label)}</span></a>`
        }).join('')
      })()}
    </nav>
    <a class="admin-logout-link" href="/admin/logout">退出登录</a>
  </aside>
  <main class="admin-main">
    <div class="admin-content">
      ${opts.body}
    </div>
  </main>
</div>
<nav class="admin-bottom-nav" aria-label="后台快捷导航">
  <a href="/admin" class="${opts.active === '/admin' ? 'active' : ''}"><span>🏠</span>首页</a>
  <a href="/admin/articles" class="${opts.active === '/admin/articles' ? 'active' : ''}"><span>📰</span>内容</a>
  <a href="/admin/pages" class="${opts.active === '/admin/pages' ? 'active' : ''}"><span>📄</span>页面</a>
  <a href="/admin/seo" class="${opts.active === '/admin/seo' ? 'active' : ''}"><span>🚀</span>SEO</a>
  <a href="/admin/ai-settings" class="${opts.active === '/admin/ai-settings' || opts.active === '/admin/ai-prompts' ? 'active' : ''}"><span>🤖</span>AI</a>
  <a href="/admin/settings" class="${opts.active === '/admin/settings' ? 'active' : ''}"><span>⚙️</span>设置</a>
</nav>
<script>
function toggleAdminMenu(open){
  var sidebar=document.getElementById('adminSidebar');
  var overlay=document.getElementById('adminOverlay');
  var button=document.querySelector('.admin-hamburger');
  if(!sidebar||!overlay) return;
  sidebar.classList.toggle('open',!!open);
  overlay.classList.toggle('open',!!open);
  if(button) button.setAttribute('aria-expanded',String(!!open));
}
document.querySelectorAll('.admin-sidebar a').forEach(function(link){
  link.addEventListener('click',function(){ toggleAdminMenu(false); });
});
fetch('/admin/page-nav-labels').then(function(r){ return r.ok ? r.json() : null; }).then(function(labels){
  if(!labels) return;
  document.querySelectorAll('[data-page-key]').forEach(function(link){
    var key=link.getAttribute('data-page-key');
    var label=link.querySelector('.admin-nav-label');
    if(key && labels[key]){
      if(label) label.textContent=labels[key];
      else link.textContent=labels[key];
    }
  });
}).catch(function(){});
</script>
</body>
</html>`
}
export function renderLoginPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><title>后台登录</title>
<link rel="stylesheet" href="/styles.css" /></head>
<body class="auth-page">
<form method="post" action="/admin/login" class="card auth-card">
  <h2>后台登录</h2>
  ${error ? `<p style="color:#e5484d;font-size:13px">${escapeHtml(error)}</p>` : ''}
  <input name="email" type="email" autocomplete="username" placeholder="管理员邮箱" required />
  <input name="password" type="password" autocomplete="current-password" placeholder="密码" style="margin-bottom:14px" required />
  <button class="btn" type="submit">登录</button>
  <p style="text-align:center;margin-top:12px;font-size:12px"><a href="/admin/recover">忘记密码？使用 SETUP_TOKEN 恢复管理员账号</a></p>
  <p style="text-align:center;margin-top:8px;font-size:12px;color:var(--muted)">首次使用会自动进入管理员初始化。</p>
</form>
</body></html>`
}

export function renderRecoverPage(error?: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><title>恢复管理员账号</title>
<link rel="stylesheet" href="/styles.css" /></head>
<body class="auth-page">
<form method="post" action="/admin/recover" class="card auth-card">
  <h2>恢复唯一管理员</h2>
  <p style="color:var(--muted);font-size:13px;line-height:1.7">仅用于忘记后台密码。需要首次部署时保存的 Cloudflare Secret：<strong>SETUP_TOKEN</strong>。恢复后原密码立即失效。</p>
  ${error ? `<p style="color:#e5484d;font-size:13px">${escapeHtml(error)}</p>` : ''}
  <input name="setup_token" type="password" autocomplete="off" placeholder="SETUP_TOKEN" required />
  <input name="email" type="email" autocomplete="username" placeholder="新的管理员邮箱" required />
  <input name="password" type="password" autocomplete="new-password" placeholder="新的密码（至少10位，含两类字符）" minlength="10" maxlength="128" required />
  <button class="btn" type="submit">恢复管理员账号</button>
  <p style="text-align:center;margin-top:12px;font-size:12px"><a href="/admin/login">返回登录</a></p>
</form>
</body></html>`
}
export function renderSetupPage(error?: string, options: { requireToken?: boolean } = {}): string {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" /><title>初始化管理员账号</title>
<link rel="stylesheet" href="/styles.css" /></head>
<body class="auth-page">
<form method="post" action="/admin/setup" class="card auth-card">
  <h2>初始化管理员账号</h2>
  <p style="color:var(--muted);font-size:13px">首次使用请创建管理员账号，创建后会自动登录后台。</p>
  ${error ? `<p style="color:#e5484d;font-size:13px">${escapeHtml(error)}</p>` : ''}
  ${options.requireToken ? '<input name="setup_token" type="password" autocomplete="off" placeholder="初始化令牌（Cloudflare Secret：SETUP_TOKEN）" required />' : ''}
  <input name="email" type="email" autocomplete="username" placeholder="管理员邮箱" required />
  <input name="password" type="password" autocomplete="new-password" placeholder="密码（至少10位，含两类字符）" minlength="10" maxlength="128" style="margin-bottom:14px" required />
  <button class="btn" type="submit">创建账号并登录</button>
</form>
</body></html>`
}

export function renderDashboard(stats: {
  articles: number; today: number; pending: number; keywords: number
  todayViews: number; trend: { date: string; views: number }[]
  topKeywords: { keyword: string; opportunity_score: number; city_name?: string; service_name?: string }[]
}): string {
  const maxViews = Math.max(1, ...stats.trend.map((t) => t.views))
  return renderAdminLayout({
    title: '数据概览',
    active: '/admin',
    body: `
    <h2>数据概览</h2>
    <div class="stat-cards">
      <div class="stat-card"><div class="num">${stats.todayViews * 10}</div><div class="label">今日访问量（抽样估算）</div></div>
      <div class="stat-card"><div class="num">${stats.articles}</div><div class="label">文章总数</div></div>
      <div class="stat-card"><div class="num">${stats.pending}</div><div class="label">待审核</div></div>
      <div class="stat-card"><div class="num">${stats.keywords}</div><div class="label">关键词矩阵</div></div>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h3>近 ${stats.trend.length} 天访问趋势</h3>
      ${stats.trend.length ? `
      <div style="display:flex;align-items:flex-end;gap:10px;height:120px;padding-top:10px">
        ${stats.trend.map((t) => `
          <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
            <div style="width:100%;max-width:36px;background:var(--primary);border-radius:4px 4px 0 0;height:${Math.max(4, Math.round((t.views / maxViews) * 90))}px" title="${t.date}: ${t.views}"></div>
            <div style="font-size:11px;color:var(--muted)">${t.date.slice(5)}</div>
          </div>`).join('')}
      </div>` : `<p style="color:var(--muted);font-size:13px">暂无访问数据，网站有访客后这里会显示趋势</p>`}
    </div>

    <div class="card" style="margin-bottom:20px">
      <h3>热门关键词（按机会分排序）</h3>
      ${stats.topKeywords.length ? `
      <table>
        <thead><tr><th>关键词</th><th>城市</th><th>服务</th><th>机会分</th></tr></thead>
        <tbody>
        ${stats.topKeywords.map((k) => `<tr>
          <td>${k.keyword}</td><td>${k.city_name || ''}</td><td>${k.service_name || ''}</td><td>${k.opportunity_score}</td>
        </tr>`).join('')}
        </tbody>
      </table>` : `<p style="color:var(--muted);font-size:13px">还没有关键词数据，去「关键词管理」一键生成矩阵</p>`}
    </div>

    <div class="card">
      <h3>快速操作</h3>
      <p><a class="btn" href="/admin/articles/new">+ 新建文章</a>
      &nbsp;<form method="post" action="/admin/keywords/generate" style="display:inline"><button class="btn secondary" type="submit">一键生成城市关键词矩阵</button></form>
      &nbsp;<a class="btn secondary" href="/admin/seo">提交 Sitemap / 推送搜索引擎</a></p>
    </div>
  `,
  })
}

export function renderArticlesList(rows: any[], statusFilter?: string): string {
  const tabs = [
    { key: '', label: '全部' },
    { key: 'pending_review', label: '待审核' },
    { key: 'published', label: '已发布' },
    { key: 'draft', label: '草稿/已驳回' },
  ]
  return renderAdminLayout({
    title: '内容管理', active: '/admin/articles',
    body: `
    <div class="section-title"><h2>文章管理</h2><a class="btn" href="/admin/articles/new">+ 新建文章</a></div>
    <div style="margin-bottom:12px">
      ${tabs.map((t) => `<a class="btn ${(statusFilter || '') === t.key ? '' : 'secondary'}" style="margin-right:8px" href="/admin/articles${t.key ? '?status=' + t.key : ''}">${t.label}</a>`).join('')}
    </div>
    <table>
      <thead><tr><th>标题</th><th>前台行业资讯标签</th><th>城市</th><th>状态</th><th>来源</th><th>可信度</th><th>操作</th></tr></thead>
      <tbody>
      ${rows.map((a) => `<tr>
        <td>${escapeHtml(a.title)}</td>
        <td>${escapeHtml(a.category || '-')}</td>
        <td>${escapeHtml(a.city_name || '全国')}</td>
        <td>${statusBadge(a.status)}${a.reject_reason ? `<div style="color:#e5484d;font-size:12px">驳回原因：${escapeHtml(a.reject_reason)}</div>` : ''}</td>
        <td>${a.ai_generated ? `AI采集${a.source_name ? '(' + escapeHtml(a.source_name) + ')' : ''}` : '人工'}</td>
        <td>${a.credibility_score ?? '-'}</td>
        <td>
            <a href="/admin/articles/${a.id}/edit">编辑</a> &nbsp;
            <a href="/admin/articles/${a.id}/preview" target="_blank">预览</a>
            ${a.status === 'published' && a.slug ? ` &nbsp; <a href="/article/${encodeURIComponent(a.slug)}" target="_blank">前台页面</a>` : ''} &nbsp;
            <a href="/admin/articles/${a.id}/wechat" style="color:#07c160">微信排版</a> &nbsp;
            <a href="/admin/articles/${a.id}/social" style="color:#ff2442">多平台分发</a> &nbsp;
            ${a.status === 'pending_review' ? `
              <form style="display:inline" method="post" action="/admin/articles/${a.id}/approve"><button class="btn" style="padding:2px 10px">审核通过并发布</button></form>
              <form style="display:inline" method="post" action="/admin/articles/${a.id}/reject" onsubmit="return setReason(this)">
                <button class="btn secondary" style="padding:2px 10px">驳回</button>
              </form>
            ` : ''}
            <form style="display:inline" method="post" action="/admin/articles/${a.id}/delete" onsubmit="return confirm('确认删除？删除后不可恢复。')"><button class="btn secondary" style="padding:2px 10px;color:#e5484d" type="submit">删除</button></form>
        </td>
      </tr>`).join('')}
      </tbody>
    </table>
    <script>
      function setReason(form){
        const reason = prompt('请输入驳回原因：', '内容不符合发布标准');
        if(reason === null) return false;
        const input = document.createElement('input');
        input.type='hidden'; input.name='reason'; input.value=reason;
        form.appendChild(input);
        return true;
      }
    </script>
  `,
  })
}

function statusBadge(status: string) {
  const map: Record<string, string> = { draft: '草稿', pending_review: '待审核', published: '已发布' }
  return `<span class="badge">${map[status] || status}</span>`
}

export function renderArticleAiPreview(opts: {
  articleId?: string
  title: string
  slug?: string
  category?: string
  summary?: string
  seoTitle?: string
  seoDescription?: string
  seoKeywords?: string
  coverImage?: string
  aiTitle: string
  aiSummary: string
  aiContent: string
}): string {
  const safeId = opts.articleId ? escapeHtml(opts.articleId) : ''
  const saveAction = opts.articleId ? '/admin/articles/' + safeId + '/edit' : '/admin/articles/new'
  const backHref = opts.articleId ? '/admin/articles/' + safeId + '/edit' : '/admin/articles/new'
  const body = [
    "<div class='section-title'><h2>AI 正文生成预览</h2><a href='" + backHref + "'>← 返回编辑</a></div>",
    "<div class='card' style='margin-bottom:16px'>",
    "<p style='margin-top:0;color:var(--muted);font-size:13px'>本页只生成预览，不会直接写入 D1。确认内容后可保存草稿或提交待审核；发布需人工审核。</p>",
    "<p><strong>AI 推荐标题：</strong>" + escapeHtml(opts.aiTitle) + "</p>",
    "<p><strong>AI 推荐摘要：</strong>" + escapeHtml(opts.aiSummary) + "</p>",
    "</div>",
    "<form class='admin-form' method='post' action='" + saveAction + "'>",
    "<input type='hidden' name='from_ai_preview' value='1' />",
    "<input type='hidden' name='title' value='" + escapeHtml(opts.aiTitle || opts.title) + "' />",
    "<input type='hidden' name='slug' value='" + escapeHtml(opts.slug || '') + "' />",
    "<input type='hidden' name='category' value='" + escapeHtml(opts.category || '') + "' />",
    "<input type='hidden' name='summary' value='" + escapeHtml(opts.aiSummary || opts.summary || '') + "' />",
    "<input type='hidden' name='seo_title' value='" + escapeHtml(opts.seoTitle || '') + "' />",
    "<input type='hidden' name='seo_description' value='" + escapeHtml(opts.seoDescription || '') + "' />",
    "<input type='hidden' name='seo_keywords' value='" + escapeHtml(opts.seoKeywords || '') + "' />",
    "<label>封面图（可选，AI 不自动生成图片）</label>","<input name='cover_image' id='cover_image_ai_preview' placeholder='/media/xxx.jpg 或 https://...' value='" + escapeHtml(opts.coverImage || '') + "' />","<p style='font-size:12px;color:var(--muted)'><a href='/admin/media' target='_blank'>打开媒体库上传 →</a></p>",
    "<label>AI 生成正文（可在这里修改后再保存）</label>",
    "<textarea name='content' rows='18'>" + escapeHtml(opts.aiContent) + "</textarea>",
    "<div style='display:flex;gap:10px;flex-wrap:wrap'>",
    "<button class='btn' type='submit' name='status' value='draft'>采用并保存草稿</button>",
    "<button class='btn' type='submit' name='status' value='pending_review'>采用并提交审核</button>",
    "</div></form>"
  ].join('')
  return renderAdminLayout({
    title: 'AI 正文预览',
    active: '/admin/articles',
    body,
  })
}

export function renderArticleForm(article?: any, pageContact?: PageContactMethods, error = ''): string {
  const a = article || { title: '', slug: '', category: '', summary: '', content: '', status: 'draft', city_id: '', seo_title: '', seo_description: '', seo_keywords: '' }
  return renderAdminLayout({
    title: article ? '编辑文章' : '新建文章', active: '/admin/articles',
    body: `
    <h2>${article ? '编辑文章' : '新建文章'}</h2>
    ${error ? '<div class="card" style="border-left:4px solid #e5484d;color:#c92a2a;margin:12px 0">' + escapeHtml(error) + '</div>' : ''}
    ${article ? `<div class="article-public-link card" style="margin:12px 0;background:#f8fbff;border-color:#dbe7f5">
      <strong>前台页面</strong>
      ${a.status === 'published'
        ? (() => {
            const publicKey = String(a.slug || '').trim() || String(a.id)
            return '<a href="/article/' + encodeURIComponent(publicKey) + '" target="_blank" rel="noopener noreferrer">/article/' + escapeHtml(publicKey) + ' ↗ 查看前台页面</a>'
          })()
        : '<span style="color:var(--muted);font-size:12px">当前文章还没有已发布的前台页面。</span>'}
    </div>` : ''}
    ${a.card_svg ? `<div class="card" style="max-width:320px;margin-bottom:12px">${renderSafeSvgImage(a.card_svg)}</div>` : ''}
    <form class="admin-form" method="post" action="${article ? `/admin/articles/${article.id}/edit` : '/admin/articles/new'}">
      <input name="title" placeholder="标题" value="${escapeHtml(a.title)}" required />
      <input name="slug" placeholder="URL别名 (留空自动生成)" value="${escapeHtml(a.slug)}" />
      <div class="card" style="margin:12px 0;border-left:4px solid var(--primary)">
        <strong>📌 前台行业资讯标签（可直接修改）</strong>
        <p style="color:var(--muted);font-size:12px;margin:6px 0">这个标签就是前台「行业资讯」文章顶部显示的标签。修改后点击“保存”，前台立即使用新标签。</p>
        <label style="margin-top:8px">前台行业资讯标签</label>
        <input name="category" list="article-tags" placeholder="例如：政策解读、业务知识、企业咨询、业务资料指南" value="${escapeHtml(a.category)}" />
      </div>
      <datalist id="article-tags"><option value="政策解读"></option><option value="业务知识"></option><option value="企业咨询"></option><option value="业务资料指南"></option><option value="服务指南"></option><option value="企业合规"></option><option value="行业资讯"></option><option value="常见问题"></option></datalist>

      <div class="card" style="margin:12px 0;border-left:4px solid #7048e8">
        <strong>🖼️ 封面图 / 配图</strong>
        <p style="color:var(--muted);font-size:12px;margin:6px 0">支持填写 R2/HTTPS 图片地址；也可以先在媒体库上传图片，再复制地址到这里。AI 负责正文和 SEO，图片仍由人工选择。</p>
        <label style="margin-top:8px">封面图地址 cover_image</label>
        <input name="cover_image" id="cover_image_input" placeholder="/media/your-image.jpg 或 https://..." value="${escapeHtml(a.cover_image || "")}" />
        <div id="cover_preview_wrap" style="margin-top:10px;${a.cover_image ? '' : 'display:none'}">
          <img id="cover_preview" src="${escapeHtml(a.cover_image || "")}" alt="封面预览" style="max-width:280px;max-height:160px;border-radius:8px;border:1px solid #e9ecef;object-fit:cover" onerror="this.style.display='none'" />
        </div>
        <p style="font-size:12px;color:var(--muted);margin-top:8px">
          <a href="/admin/media" target="_blank" rel="noopener">打开媒体库上传 →</a>
          <span style="color:var(--muted)">上传 JPG/PNG/WEBP/GIF 后复制地址即可。</span>
          <form method="post" action="/admin/articles/image-upload-page" enctype="multipart/form-data" target="_blank" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px">
            <input type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required />
            <button class="btn secondary" type="submit">⬆ 直接上传图片</button>
            <span style="font-size:12px;color:var(--muted)">上传成功页可一键复制封面地址或正文配图 HTML。</span>
          </form>
        </p>
      </div>
      <textarea name="summary" placeholder="摘要" rows="2">${escapeHtml(a.summary)}</textarea>
      <textarea name="content" placeholder="正文内容（支持HTML）；留空后保存会自动由 Workers AI 生成，也可以先点下方“AI生成预览”检查后再保存" rows="10">${escapeHtml(a.content)}</textarea>
      <select name="status">
        <option value="draft" ${a.status === 'draft' ? 'selected' : ''}>草稿</option>
        <option value="pending_review" ${a.status === 'pending_review' ? 'selected' : ''}>待审核</option>
        <option value="published" ${a.status === 'published' ? 'selected' : ''}>已发布</option>
      </select>
      <div class="card" style="margin-top:10px">
        <strong>SEO由「关键词管理」统一设置</strong>
        <p style="color:var(--muted);font-size:12px;margin:6px 0">文章保存或 AI 生成时自动整理 SEO 标题、描述和主题词；AI 生成结果先进入待审核，不会绕过人工审核自动公开。</p>
      </div>
      <input type="hidden" name="article_id" value="${article ? escapeHtml(article.id) : ''}" />
      <button class="btn" type="submit">保存</button>
      ${article ? '<button class="btn" type="button" onclick="document.getElementById(\'publishArticleForm\').submit()">发布并生成前台页面</button>' : ''}
      <button class="btn secondary" type="submit" formaction="/admin/articles/ai-publish" formmethod="post">🤖 AI生成正文+SEO并进入待审核</button>
      <button class="btn secondary" type="submit" formaction="/admin/articles/ai-preview" formmethod="post">正文留空：生成预览</button>
      <span style="color:var(--muted);font-size:12px;margin-left:8px">AI 生成结果先进入待审核；审核后可点击“发布并生成前台页面”。</span>
    </form>
    ${article ? `<form class="admin-form" method="post" action="/admin/articles/${article.id}/ai-optimize" style="margin-top:10px"><button class="btn secondary" type="submit" onclick="return confirm('使用 Workers AI 优化当前文章正文？原文章链接会保留。')">🤖 AI优化当前文章</button><span style="color:var(--muted);font-size:12px;margin-left:8px">AI优化不会直接公开；审核确认后可点击上面的发布按钮。</span></form>` : ''}
    ${article ? `<form id="publishArticleForm" method="post" action="/admin/articles/${article.id}/publish" style="margin-top:10px"><span style="color:var(--muted);font-size:12px">发布会自动补齐 slug、正文（为空时尝试 AI 生成）、SEO 和内容卡，并直接打开前台页面。</span></form>` : ''}

    <form method="post" action="/admin/articles/${article ? article.id : 'new'}/content/delete" onsubmit="return confirm('确认删除这篇文章内容？删除后不可恢复。')" style="margin-top:10px">${article ? '<button class="btn secondary" type="submit">删除文章内容</button>' : ''}</form>
  `,
  })
}

export function renderCitiesList(rows: any[], catalog: any[] = [], message = ''): string {
  const addedKeys = new Set(rows.flatMap((x) => [String(x.name || ''), String(x.slug || '')]))
  const availableCatalog = catalog.filter((x) => !addedKeys.has(String(x.name || '')) && !addedKeys.has(String(x.slug || '')))
  const provinces = Array.from(new Set(availableCatalog.map((x) => x.province)))
  return renderAdminLayout({
    title: '城市管理', active: '/admin/cities',
    body: `
    <div class="section-title"><h2>城市管理</h2><a class="btn secondary" href="/admin/services">服务管理 →</a></div>
    <p style="color:var(--muted)">选择全国城市加入城市库。已经添加的城市会自动从选择器中隐藏并按名称/slug 去重；新增城市会参与城市 × 服务 SEO 矩阵。</p>
    ${message ? `<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:16px">${escapeHtml(message)}</div>` : ''}
    <div class="card" style="margin-bottom:18px">
      <h3 style="margin-top:0">选择全国城市</h3>
      <form class="admin-form" method="post" action="/admin/cities/add">
        <label>城市库选择</label>
        <select name="catalog_key">
          <option value="">请选择城市</option>
          ${provinces.length ? provinces.map((province) => `<optgroup label="${escapeHtml(province)}">${availableCatalog.filter((x) => x.province === province).map((x) => `<option value="${escapeHtml(x.province + '|' + x.name + '|' + x.slug + '|' + x.tier)}">${escapeHtml(x.name)}（${escapeHtml(x.tier)}）</option>`).join('')}</optgroup>`).join('') : `<option value="" disabled>全国城市库已全部添加</option>`}
        </select>
        <button class="btn" type="submit">加入城市</button>
      </form>
      <form class="admin-form" method="post" action="/admin/cities/add" style="margin-top:12px">
        <label>手工添加城市（全国任何城市都可以）</label>
        <input name="province" placeholder="省份/自治区/直辖市" required />
        <input name="name" placeholder="城市名称" required />
        <input name="slug" placeholder="URL slug，如 shenzhen" required pattern="[a-z0-9-]+" />
        <select name="tier"><option>一线</option><option>新一线</option><option selected>二线</option><option>三线</option></select>
        <button class="btn secondary" type="submit">手工加入城市</button>
      </form>
    </div>

    <form method="post" action="/admin/cities/bulk-delete" id="bulkCitiesForm" onsubmit="return confirmBulkCityDelete()">
      <div class="card bulk-city-toolbar" style="margin-bottom:14px">
        <div class="bulk-city-toolbar-head">
          <div>
            <strong>批量删除城市</strong>
            <p class="bulk-city-help">已生成/待生成内容、启用/停用城市都可以一起选择删除。删除会同步清理该城市的关键词、AI城市内容、AI生成文章、独立联系方式和页面图片。</p>
          </div>
          <strong id="bulkCityCount">已选择 0 个</strong>
        </div>
        <div class="admin-actions">
          <button class="btn secondary" type="button" onclick="setCitySelection('all')">全选当前列表</button>
          <button class="btn secondary" type="button" onclick="setCitySelection('with-content')">选择已生成内容</button>
          <button class="btn secondary" type="button" onclick="setCitySelection('without-content')">选择待生成内容</button>
          <button class="btn secondary" type="button" onclick="setCitySelection('active')">选择已启用</button>
          <button class="btn secondary" type="button" onclick="setCitySelection('inactive')">选择已停用</button>
          <button class="btn secondary" type="button" onclick="setCitySelection('none')">清空选择</button>
          <button class="btn danger" type="submit">删除选中城市</button>
        </div>
      </div>

      <div class="admin-table-wrap">
        <table>
          <thead><tr>
            <th><input type="checkbox" id="selectAllCities" aria-label="全选城市" onchange="setAllCityCheckboxes(this.checked)" /></th>
            <th>城市</th><th>省份</th><th>等级</th><th>状态</th><th>SEO</th><th>页面内容</th><th>操作</th>
          </tr></thead>
          <tbody>
          ${rows.length ? rows.map((c) => `<tr>
            <td><input type="checkbox" class="city-checkbox" name="city_ids" value="${escapeHtml(c.id)}" data-active="${c.is_active ? '1' : '0'}" data-content="${c.ai_content_exists ? '1' : '0'}" onchange="updateBulkCityCount()" aria-label="选择${escapeHtml(c.name)}" /></td>
            <td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.province || '')}</td>
            <td><span class="badge">${escapeHtml(c.tier || '二线')}</span></td>
            <td>${c.is_active ? '启用' : '停用'}</td>
            <td>${c.seo_title ? '已设置' : '自动生成'}</td>
            <td>${c.ai_content_exists ? '已生成' : '待生成'}</td>
            <td>
              <a href="/admin/cities/${escapeHtml(c.id)}/edit">编辑</a>
              &nbsp;
              <button class="btn secondary ai-city-generate" type="button" data-city-id="${escapeHtml(c.id)}">🤖 AI生成</button>
              &nbsp;
              <form style="display:inline" method="post" action="/admin/cities/${escapeHtml(c.id)}/delete" onsubmit="return confirm('确认删除该城市及其关键词、AI内容、图片？删除后不可恢复。')"><button class="btn secondary" style="padding:2px 10px;color:#e5484d" type="submit">删除</button></form>
            </td>
          </tr>`).join('') : `<tr><td colspan="8" style="color:var(--muted);text-align:center;padding:24px">暂无城市，请先从全国城市库添加。</td></tr>`}
          </tbody>
        </table>
      </div>
    </form>

    <script>
      function cityBoxes(){ return Array.from(document.querySelectorAll('.city-checkbox')); }
      function updateBulkCityCount(){
        const boxes = cityBoxes();
        const selected = boxes.filter(function(box){ return box.checked; });
        const count = document.getElementById('bulkCityCount');
        if(count) count.textContent = '已选择 ' + selected.length + ' 个';
        const selectAll = document.getElementById('selectAllCities');
        if(selectAll){
          selectAll.checked = boxes.length > 0 && selected.length === boxes.length;
          selectAll.indeterminate = selected.length > 0 && selected.length < boxes.length;
        }
      }
      function setAllCityCheckboxes(checked){
        cityBoxes().forEach(function(box){ box.checked = checked; });
        updateBulkCityCount();
      }
      function setCitySelection(mode){
        cityBoxes().forEach(function(box){
          const active = box.dataset.active === '1';
          const content = box.dataset.content === '1';
          box.checked =
            mode === 'all' ||
            (mode === 'with-content' && content) ||
            (mode === 'without-content' && !content) ||
            (mode === 'active' && active) ||
            (mode === 'inactive' && !active);
          if(mode === 'none') box.checked = false;
        });
        updateBulkCityCount();
      }
      function confirmBulkCityDelete(){
        const count = cityBoxes().filter(function(box){ return box.checked; }).length;
        if(!count){
          alert('请先选择要删除的城市。');
          return false;
        }
        return confirm('确认批量删除 ' + count + ' 个城市？已生成/待生成内容、启用/停用状态都会删除，并同步清理关键词、AI城市内容、AI生成文章、独立联系方式和页面图片。删除后不可恢复。');
      }
      function startCityAiGeneration(button){
        const cityId = button.getAttribute('data-city-id');
        if(!cityId) return;
        if(button.disabled) return;
        button.disabled = true;
        button.textContent = '⏳ 生成中…';
        const form = document.createElement('form');
        form.method = 'post';
        form.action = '/admin/cities/' + encodeURIComponent(cityId) + '/ai-content';
        form.style.display = 'none';
        document.body.appendChild(form);
        form.submit();
      }
      document.querySelectorAll('.ai-city-generate').forEach(function(button){
        button.addEventListener('click', function(){ startCityAiGeneration(button); });
      });
      updateBulkCityCount();
    </script>
  `,
  })
}


export function renderCityForm(city: any, pageContent = '', aiError = '', image?: any, globalSeoKeywords = '', pageContact?: PageContactMethods): string {
  return renderAdminLayout({
    title: '编辑城市', active: '/admin/cities',
    body: `
    <h2>编辑城市：${escapeHtml(city.name)}</h2>
    ${aiError ? `<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px">${escapeHtml(aiError)}</div>` : ''}
    <form class="admin-form" method="post" action="/admin/cities/${city.id}/edit">
      <label>城市等级（影响关键词机会分权重）</label>
      <select name="tier">${['一线', '新一线', '二线', '三线'].map((t) => `<option value="${t}" ${city.tier === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <label><input type="checkbox" name="is_active" ${city.is_active ? 'checked' : ''} /> 启用该城市</label>
      <p style="color:var(--muted);font-size:12px">启用时会自动补齐空白 SEO，并可生成城市 AI 页面内容。</p>
      <div class="card" style="margin:10px 0">
        <strong>SEO由「关键词管理」统一设置</strong>
        <p style="color:var(--muted);font-size:12px;margin:6px 0">城市名称、省份、等级、状态来自城市库；SEO关键词统一从关键词管理读取并自动生成。</p><p style="font-size:12px">当前统一关键词：${escapeHtml(globalSeoKeywords || '尚未设置')}</p>
      </div>      <label>城市页面内容（后台修改，前台自动显示）</label>
      <textarea name="page_content" rows="8" placeholder="留空表示使用 AI 生成内容；AI 会结合该城市关键词主题组织内容。保存时不会自动覆盖已有 AI 内容。">${escapeHtml(pageContent)}</textarea>
      <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px"><legend style="padding:0 6px;font-size:13px;color:var(--muted)">本城市页面独立联系方式</legend>
        <p style="color:var(--muted);font-size:12px">留空使用全站默认微信/QQ；填写后只显示在 ${escapeHtml(city.name)} 页面。</p>
      </fieldset>
      <button class="btn" type="submit">保存城市设置</button>
    </form>
    <form method="post" action="/admin/cities/${city.id}/ai-content" style="margin-top:10px"><button class="btn secondary" type="submit">🤖 AI 自动生成城市页面内容</button></form>
    <form method="post" action="/admin/cities/${city.id}/content/delete" onsubmit="return confirm('确认删除该城市页面的AI正文和图片？删除后不可恢复。')" style="margin-top:10px"><button class="btn secondary" type="submit">删除城市页面内容</button></form>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">城市页面图片（R2）</h3>
      ${image?.url ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || city.name)}" style="display:block;max-width:320px;width:100%;border-radius:8px;margin-bottom:10px" />` : '<p style="color:var(--muted);font-size:12px">暂未设置图片。</p>'}
      <form class="admin-form" method="post" action="/admin/page-images/city/${escapeHtml(city.slug)}" enctype="multipart/form-data"><input type="file" name="file" accept="image/jpeg,image/png,image/webp" required /><button class="btn" type="submit">上传/替换城市图片</button></form>
      ${image?.url ? `<form method="post" action="/admin/page-images/city/${escapeHtml(city.slug)}/delete" style="display:inline" onsubmit="return confirm('确认删除该城市图片？R2 文件将直接删除。')"><button class="btn secondary" style="color:#e5484d" type="submit">删除城市图片</button></form>` : ''}
    </div>
  `,
  })
}

export function renderServiceForm(service: any, pageContent = '', aiError = '', image?: any, globalSeoKeywords = '', pageContact?: PageContactMethods): string {
  const isCreate = !service?.id
  return renderAdminLayout({
    title: isCreate ? '添加服务' : '编辑服务', active: '/admin/services',
    body: `
    <div class="section-title">
      <h2>${isCreate ? '添加服务' : '编辑服务：' + escapeHtml(service.name)}</h2>
      <a href="/admin/services" style="color:var(--muted);font-size:13px">← 返回服务管理</a>
    </div>
    ${aiError ? `<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px">${escapeHtml(aiError)}</div>` : ''}
    <form class="admin-form" method="post" action="${isCreate ? '/admin/services/new' : `/admin/services/${service.id}/edit`}">
      ${isCreate ? `
      <label>服务名称</label>
      <input name="name" maxlength="100" placeholder="例如：企业咨询、项目服务、解决方案" required />
      <label>URL slug</label>
      <input name="slug" maxlength="120" pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="例如：dai-li-ji-zhang" required />
      <label>服务简介</label>
      <textarea name="summary" rows="3" maxlength="500" placeholder="简要说明服务内容，保存后用于 SEO 描述和前台服务页。"></textarea>
      ` : ''}
      <label>需求权重 0-100</label><input type="number" name="demand_weight" min="0" max="100" value="${service.demand_weight ?? 50}" />
      <label><input type="checkbox" name="is_active" ${isCreate || service.is_active ? 'checked' : ''} /> 启用该服务</label>
      <p style="color:var(--muted);font-size:12px">启用时会自动补齐空白 SEO，并可生成服务 AI 页面内容。</p>
      <div class="card" style="margin:10px 0">
        <strong>SEO由「关键词管理」统一设置</strong>
        <p style="color:var(--muted);font-size:12px;margin:6px 0">服务SEO关键词不在本页填写；启用服务后由系统根据统一关键词自动生成。</p><p style="font-size:12px">当前统一关键词：${escapeHtml(globalSeoKeywords || '尚未设置')}</p>
      </div>
      ${isCreate ? '' : `
      <label>服务外站链接（填写后前台入口打开外站；留空使用本站）</label>
      <input name="external_url" value="${escapeHtml(service.external_url || '')}" placeholder="https://example.com/service" />
      <label>服务页面内容（后台修改，前台自动显示）</label>
      <textarea name="page_content" rows="8" placeholder="留空可由 AI 生成">${escapeHtml(pageContent)}</textarea>
      <fieldset style="border:1px solid var(--border);border-radius:8px;padding:12px"><legend style="padding:0 6px;font-size:13px;color:var(--muted)">本服务页面独立联系方式</legend>
        <p style="color:var(--muted);font-size:12px">留空使用全站默认微信/QQ；填写后只显示在 ${escapeHtml(service.name)} 页面。</p>
      </fieldset>
      `}
      <button class="btn" type="submit">${isCreate ? '创建服务' : '保存服务设置'}</button>
    </form>
    ${isCreate ? `
    <div class="card" style="margin-top:16px">
      <strong>创建后自动处理</strong>
      <p style="color:var(--muted);font-size:12px;line-height:1.8;margin-bottom:0">启用时自动生成 SEO 标题、描述和关键词；创建完成后进入服务编辑页，可以继续用 Workers AI 生成页面正文并上传 R2 图片。</p>
    </div>
    ` : `
    <form method="post" action="/admin/services/${service.id}/ai-content" style="margin-top:10px"><button class="btn secondary" type="submit">🤖 AI 自动生成服务页面内容</button></form>
    <form method="post" action="/admin/services/${service.id}/content/delete" onsubmit="return confirm('确认删除该服务页面的AI正文和图片？删除后不可恢复。')" style="margin-top:10px"><button class="btn secondary" type="submit">删除服务页面内容</button></form>
    <div class="card" style="margin-top:16px"><h3 style="margin-top:0">服务页面图片（R2）</h3>
      ${image?.url ? `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt || service.name)}" style="display:block;max-width:320px;width:100%;border-radius:8px;margin-bottom:10px" />` : '<p style="color:var(--muted);font-size:12px">暂未设置图片。</p>'}
      <form class="admin-form" method="post" action="/admin/page-images/service/${escapeHtml(service.slug)}" enctype="multipart/form-data"><input type="file" name="file" accept="image/jpeg,image/png,image/webp" required /><button class="btn" type="submit">上传/替换服务图片</button></form>
      ${image?.url ? `<form method="post" action="/admin/page-images/service/${escapeHtml(service.slug)}/delete" style="display:inline" onsubmit="return confirm('确认删除该服务图片？R2 文件将直接删除。')"><button class="btn secondary" style="color:#e5484d" type="submit">删除服务图片</button></form>` : ''}
    </div>
    `}
  `,
  })
}

function renderSeoAuditPanel(seoAudit: { pages: Array<SeoAuditPage & { audit: SeoAuditResult; dbId?: number }>; summary: { total: number; average: number; good: number; optimize: number; weak: number; blocked: number; indexable: number; lowQuality: number } }): string {
  const lowPages = seoAudit.pages
    .filter((p) => p.audit.status === 'weak' || p.audit.status === 'blocked')
    .sort((a, b) => a.audit.score - b.audit.score)
    .slice(0, 20)
  const typeLabel: Record<string, string> = { home: '首页', list: '列表页', article: '文章', city: '城市', service: '服务', landing: '城市×服务' }
  const rows = lowPages.map((p) => {
    const isManaged = p.type === 'home' || p.type === 'list'
    const managedKey = isManaged ? String(p.key || '') : ''
    const canDelete = !!(p.aiGenerated && (isManaged || ['article', 'city', 'service', 'landing'].includes(p.type)) && (isManaged || p.dbId))
    const deleteForm = canDelete
      ? '<form method="post" action="/admin/seo-audit/delete" style="display:inline" onsubmit="return confirm(\'确认删除这个低质量 AI 内容？页面本体不会删除；城市×服务落地页会同步删除关键词入口。\')"><input type="hidden" name="type" value="' + escapeHtml(p.type) + '"><input type="hidden" name="key" value="' + escapeHtml(managedKey) + '"><input type="hidden" name="id" value="' + escapeHtml(String(p.dbId || '')) + '"><button class="btn secondary" style="padding:4px 9px">清理 AI 内容</button></form>'
      : ''
    const optimizePath = isManaged
      ? '/admin/pages/' + managedKey + '/edit'
      : p.type === 'article'
        ? '/admin/articles/' + p.dbId + '/edit'
        : p.type === 'city'
          ? '/admin/cities/' + p.dbId + '/edit'
          : p.type === 'service'
            ? '/admin/services/' + p.dbId + '/edit'
            : p.type === 'landing'
              ? '/admin/keywords/' + p.dbId + '/edit'
              : ''
    const optimize = optimizePath ? '<a href="' + escapeHtml(optimizePath) + '" style="margin-left:8px">查看/编辑</a>' : ''
    const optimizeAction = p.aiGenerated && (p.audit.status === 'weak' || p.audit.status === 'blocked')
      ? '<form method="post" action="/admin/seo-audit/optimize-one" style="display:inline;margin-left:8px" onsubmit="return confirm(\'建议先让 AI 重新优化此页面。继续？\')"><input type="hidden" name="type" value="' + escapeHtml(p.type) + '"><input type="hidden" name="id" value="' + escapeHtml(String(p.dbId || '')) + '"><input type="hidden" name="key" value="' + escapeHtml(managedKey) + '"><button class="btn secondary" style="padding:4px 9px">🤖 AI优化</button></form>'
      : ''
    const actionHint = p.audit.status === 'weak' ? '<span style="color:#ad6800;font-size:11px">建议AI优化后复评</span>' : p.audit.status === 'blocked' ? '<span style="color:#e5484d;font-size:11px">当前没有公开SEO入口</span>' : ''
    return '<tr><td>' + escapeHtml(typeLabel[p.type] || p.type) + '</td><td><a href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">' + escapeHtml(p.title || p.url) + '</a></td><td><strong>' + p.audit.score + '</strong></td><td>' + escapeHtml(p.audit.label) + '</td><td>' + escapeHtml(p.audit.reasons.slice(0, 3).join('；') || '需要检查内容') + '<br>' + actionHint + '</td><td>' + optimize + optimizeAction + deleteForm + '</td></tr>'
  }).join('')

  return [
    '<div class="card seo-audit-dashboard" style="margin-bottom:16px">',
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap"><div><h3 style="margin:0">🔎 前台 SEO 收录机会整体评估</h3><p style="margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.7">这是站内技术与内容质量评估，不代表搜索引擎已经收录，也不能保证一定收录。弱质页面优先重新生成；真正低质量或当前不可索引的 AI 内容才进入删除队列，人工内容不会被批量删除。</p></div><div class="admin-actions"><button class="btn secondary" type="button" id="seoAuditOptimizeBtn">🤖 一键优化 50–67 分 AI页面</button><button class="btn secondary" type="button" id="seoAuditDeleteBtn">🧹 一键删除 &lt;50 / 不可索引 AI内容</button></div></div>',
    '<div id="seoAuditBatchStatus" style="margin-top:10px;color:var(--muted);font-size:12px;line-height:1.7"></div>',
    '<script>(function(){var opt=document.getElementById("seoAuditOptimizeBtn"),del=document.getElementById("seoAuditDeleteBtn"),status=document.getElementById("seoAuditBatchStatus");if(!opt||!del||!status)return;async function purge(){try{var f=new URLSearchParams();f.set("scope","cache");f.set("phase","d1");f.set("cursor","");await fetch("/admin/production-cleanup",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},credentials:"same-origin",body:f.toString()});}catch(e){}}async function run(endpoint,label,confirmText){if(!confirm(confirmText))return;opt.disabled=true;del.disabled=true;var total=0,excluded=[];status.textContent=label+"：处理中，请勿关闭页面…";try{while(true){var f=new URLSearchParams();f.set("ajax","1");if(excluded.length)f.set("exclude",excluded.join(","));var res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded;charset=UTF-8"},credentials:"same-origin",body:f.toString()});var data=await res.json().catch(function(){return {ok:false,error:"服务器返回无效JSON"};});if(!res.ok||!data.ok)throw new Error(data.error||"操作失败");total+=Number(data.processed||0);if(data.key&&!excluded.includes(data.key))excluded.push(data.key);status.textContent=label+"：已处理 "+total+" 项"+(data.remainingHint?"，继续处理…":"");if(data.complete)break;}await purge();status.textContent=label+"：完成，共处理 "+total+" 项，公开缓存已刷新。";setTimeout(function(){location.reload()},800);}catch(e){status.textContent=label+"：中断："+(e&&e.message?e.message:e);opt.disabled=false;del.disabled=false;}}opt.addEventListener("click",function(){run("/admin/seo-audit/optimize-low-batch","一键优化","服务器会逐项重新生成 50–67 分的 AI 页面，只处理 AI 生成内容；确认继续？")});del.addEventListener("click",function(){run("/admin/seo-audit/cleanup-low-batch","一键删除","将逐项删除评分 <50 或当前不可索引的 AI 内容；城市/服务本体不删除，落地页会删除对应关键词入口。删除不可恢复，确认继续？")});})();</script>',
    '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:10px;margin-top:14px">',
    '<div class="stat-card"><div class="label">评估页面</div><div class="num">' + seoAudit.summary.total + '</div></div>',
    '<div class="stat-card"><div class="label">平均机会分</div><div class="num">' + seoAudit.summary.average + '</div></div>',
    '<div class="stat-card"><div class="label">条件较完整</div><div class="num">' + seoAudit.summary.good + '</div></div>',
    '<div class="stat-card"><div class="label">建议优化</div><div class="num">' + (seoAudit.summary.optimize + seoAudit.summary.weak) + '</div></div>',
    '<div class="stat-card"><div class="label">低质量</div><div class="num">' + seoAudit.summary.lowQuality + '</div></div>',
    '<div class="stat-card"><div class="label">具备可索引条件</div><div class="num">' + seoAudit.summary.indexable + '</div></div>',
    '<div class="stat-card"><div class="label">不可索引</div><div class="num">' + seoAudit.summary.blocked + '</div></div>',
    '</div>',
    '<div style="margin-top:14px;padding:10px 12px;background:#f8fbff;border:1px solid #dbe7f7;border-radius:8px;font-size:12px;line-height:1.8"><strong>分数说明：</strong>82+ = 收录基础条件较完整；68–81 = 具备基础条件但建议优化；50–67 = 页面价值偏弱，可一键重新生成；低于50 = 低质量；不可索引 = 当前没有公开 SEO 入口。批量删除只处理 AI 生成内容。</div>',
    lowPages.length
      ? '<details open style="margin-top:14px"><summary style="cursor:pointer;font-weight:650">低质量 / 不可索引页面（前20）</summary><div class="admin-table-wrap" style="margin-top:10px"><table><thead><tr><th>类型</th><th>页面</th><th>评分</th><th>判断</th><th>主要问题</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table></div></details>'
      : '<p style="margin:14px 0 0;color:#389e0d;font-size:12px">当前没有需要批量优化或删除的 AI 页面。</p>',
    '</div>',
  ].join('')
}

export function renderKeywordsList(rows: any[], siteKeywords = '', message = '', cleanupPending = 0, seoStats: { keywordCleanup: number; duplicateKeywords: number; duplicateKeywordGroups: number; generatedCities: number; generatedServices: number; generatedLandings: number; sitemapLandings: number; publishedAiArticles: number; generatedAiArticles: number; lowScorePublishedAiArticles: number; invalidCities: number; invalidServices: number; invalidLandings: number; invalidTotal: number } = { keywordCleanup: 0, duplicateKeywords: 0, duplicateKeywordGroups: 0, generatedCities: 0, generatedServices: 0, generatedLandings: 0, sitemapLandings: 0, publishedAiArticles: 0, generatedAiArticles: 0, lowScorePublishedAiArticles: 0, invalidCities: 0, invalidServices: 0, invalidLandings: 0, invalidTotal: 0 }, seoAudit: { pages: Array<(SeoAuditPage & { audit: SeoAuditResult; dbId?: number })>; summary: { total: number; average: number; good: number; optimize: number; weak: number; blocked: number; indexable: number; lowQuality: number } } = { pages: [], summary: { total: 0, average: 0, good: 0, optimize: 0, weak: 0, blocked: 0, indexable: 0, lowQuality: 0 } }): string {
  return renderAdminLayout({
    title: '统一 SEO 关键词', active: '/admin/keywords',
    body: `
    <div class="section-title"><h2>统一 SEO 关键词</h2>
      <div class="admin-actions">
        <form method="post" action="/admin/keywords/rescore" style="display:inline" onsubmit="return confirm('只重新计算关键词矩阵机会分，不修改页面 SEO 标题、描述或 seo_keywords。继续？')"><button class="btn secondary" type="submit">重新计算机会分</button></form>
        <button class="btn secondary" type="button" onclick="document.getElementById('seo-cleanup-options')?.scrollIntoView({behavior:'smooth'})">🧹 选择清理生产库</button>
        <form method="post" action="/admin/keywords/ai-generate" style="display:inline" onsubmit="return confirm('只生成/追加全站候选词，不直接改写城市、服务、文章的页面 SEO。继续？')"><button class="btn" type="submit">🤖 AI生成候选词</button></form>
        <form method="post" action="/admin/keywords/generate" style="display:inline" onsubmit="return confirm('只生成/更新城市×服务关键词矩阵并计算机会分，不自动改写页面 SEO。人工搜索量不会被覆盖。继续？')"><button class="btn" type="submit">一键生成/更新矩阵</button></form>
        <form method="post" action="/admin/seo/auto-fill" style="display:inline" onsubmit="return confirm('只对城市、服务、已发布文章执行页面 SEO 规范；不会修改固定候选词库、关键词矩阵或 AI 提示词。继续？')"><button class="btn secondary" type="submit">一键规范全部页面SEO</button></form>
      </div>
    </div>
    <div class="seo-cleanup-panel" id="seo-cleanup-options">
      <div>
        <strong>生产 D1 · SEO 数据清理</strong>
        <span class="badge">${cleanupPending > 0 ? '发现 ' + cleanupPending + ' 项 D1 失效/重复数据' : '当前没有 D1 失效/重复 SEO 数据'}</span>
      </div>
      <p><strong>无效关键词：</strong>${seoStats.keywordCleanup} 条；<strong>重复关键词：</strong>${seoStats.duplicateKeywords} 条（${seoStats.duplicateKeywordGroups} 组）；<strong>失效 AI 页面：</strong>${seoStats.invalidTotal} 条。</p>
      ${cleanupPending > 0 ? '<form method="post" action="/admin/keywords/cleanup" style="margin:10px 0" onsubmit="return confirm(\'确认一键清理全部无效关键词、重复关键词及失效 AI SEO 页面？只处理 D1 中明确失效/重复的数据，不删除人工文章、城市、服务或正常 SEO 页面。\')">\n        <input type="hidden" name="cleanup_invalid" value="on" />\n        <input type="hidden" name="cleanup_duplicate_keywords" value="on" />\n        <button class="btn" type="submit">⚡ 一键清理这 ${cleanupPending} 项 D1 SEO 数据</button>\n      </form>' : ''}
      <p><strong>当前 Sitemap 有效机会分 SEO 落地页：</strong>${seoStats.sitemapLandings} 个；<strong>已发布 AI 文章：</strong>${seoStats.publishedAiArticles} 篇；其中 AI评分低于 65：${seoStats.lowScorePublishedAiArticles} 篇。</p>
      <form method="post" action="/admin/keywords/cleanup" onsubmit="return confirm('请确认勾选的删除范围。全量 AI/SEO 生成数据删除后不可恢复，并会同步清理审核日志、社交分发记录和公开缓存。')">
        <label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0;padding:10px;border:1px solid #ffd591;border-radius:8px;background:#fffaf0">
          <input type="checkbox" name="cleanup_all_generated" value="on" />
          <span><strong>🧹 全量清理 AI/SEO 生成生产数据</strong><br><small>删除全部关键词矩阵、全部 AI 生成文章、全部 AI 城市/服务/落地页内容及旧版 AI 内容；同步清理文章对应审核日志、社交分发关联记录，并在返回前执行 Worker 全量缓存清理。不会删除管理员、城市、服务、人工文章或站点基础配置。</small></span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0">
          <input type="checkbox" name="cleanup_invalid" value="on" checked />
          <span><strong>清理无效 SEO 数据</strong><br><small>删除机会分 ≤ 0 / 无关联关键词，以及失效 AI SEO 页面。</small></span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0">
          <input type="checkbox" name="cleanup_duplicate_keywords" value="on" />
          <span><strong>清理重复 SEO 关键词（${seoStats.duplicateKeywords} 条）</strong><br><small>按“城市 + 服务 + 关键词”去重，保留机会分/搜索量更高的记录；重复记录对应的 AI 落地页内容也同步清理。</small></span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0">
          <input type="checkbox" name="delete_sitemap_landings" value="on" />
          <span><strong>删除当前 Sitemap 全部有效机会分 SEO 落地页（${seoStats.sitemapLandings} 个）</strong><br><small>删除对应关键词和 AI 落地页内容，使这些 URL 不再进入 Sitemap。</small></span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0">
          <input type="checkbox" name="delete_ai_articles" value="on" />
          <span><strong>删除全部已发布 AI 文章（${seoStats.publishedAiArticles} 篇）</strong><br><small>同时删除文章、审核日志、社交分发关联记录。</small></span>
        </label>
        <label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0">
          <input type="checkbox" name="delete_low_ai_articles" value="on" />
          <span><strong>删除 AI评分低于阈值的已发布 AI 文章（当前 ${seoStats.lowScorePublishedAiArticles} 篇）</strong><br><small>阈值 <input name="ai_score_threshold" type="number" min="0" max="100" value="65" style="width:70px" />；同步删除审核日志、社交分发关联记录。</small></span>
        </label>
        <button class="btn" type="submit">执行所选删除</button>
      </form>
      <p class="admin-field-hint">“全量清理 AI/SEO 生成生产数据”会一次删除所有关键词矩阵、AI文章和 AI 页面内容，并同步清理关联审核/社交记录与 Worker 全量缓存；不会删除管理员、城市、服务、人工文章和站点基础设置。普通刷新或 CF 部署不会自动触发删除。</p>
    </div>
    ${message ? `<div class="card" style="border-left:4px solid ${message.startsWith('AI关键词已生成') || message.startsWith('生产库清理完成') ? '#1a8a4e' : '#e5484d'};margin-bottom:16px">${escapeHtml(message)}</div>` : ''}
    <p style="color:var(--muted);font-size:13px">这 5 个操作职责不同：机会分只算分；清理生产库删除明确无效/重复的生产数据；AI候选词只维护全站候选词库；生成/更新矩阵只维护城市×服务关键词矩阵；规范全部页面SEO才会批量修复页面标题、描述和页面 seo_keywords。固定候选词库不会被最后一项覆盖。</p>
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-top:0">SEO 页面 / Sitemap / AI 文章数量</h3>
      <p style="color:var(--muted);font-size:13px;line-height:1.8;margin-bottom:0">
        生产 D1 已记录：城市 AI 页 <strong>${seoStats.generatedCities}</strong>，服务 AI 页 <strong>${seoStats.generatedServices}</strong>，城市×服务 AI 落地页 <strong>${seoStats.generatedLandings}</strong>；当前进入 Sitemap 的有效 SEO 落地页 <strong>${seoStats.sitemapLandings}</strong> 个；AI 文章 <strong>${seoStats.generatedAiArticles}</strong> 篇，其中已发布 <strong>${seoStats.publishedAiArticles}</strong> 篇。
        失效页面：城市 <strong>${seoStats.invalidCities}</strong>、服务 <strong>${seoStats.invalidServices}</strong>、落地页 <strong>${seoStats.invalidLandings}</strong>；重复关键词 <strong>${seoStats.duplicateKeywords}</strong> 条。
      </p>
    </div>
    ${renderSeoAuditPanel(seoAudit)}
    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-top:0">固定关键词（全站候选词库）</h3>
      <p style="color:var(--muted);font-size:13px;line-height:1.8">这里维护少量全站主题候选词，只用于辅助 AI 和内容规划。保存后不会自动改写任何页面 SEO；“一键规范全部页面 SEO”也不会修改这里的词库。建议保留 5-15 个候选词；页面实际 seo_keywords 仍固定为 3-5 个与当前页面主题直接相关的词。</p>
      <form class="admin-form" method="post" action="/admin/keywords/settings">
        <textarea name="site_keywords" rows="3" maxlength="3000" placeholder="例如：企业咨询,项目服务,解决方案,行业指南,服务流程">${escapeHtml(siteKeywords)}</textarea>
        <button class="btn" type="submit">保存候选词库</button>
      </form>
    </div>
    <div class="admin-table-wrap">
      <table>
        <thead><tr><th>关键词</th><th>城市</th><th>服务</th><th>搜索量</th><th>难度</th><th>机会分</th><th>状态</th><th>落地页</th><th>操作</th></tr></thead>
        <tbody>
        ${rows.map((k) => `<tr>
          <td>${escapeHtml(k.keyword)}</td><td>${escapeHtml(k.city_name || '')}</td><td>${escapeHtml(k.service_name || '')}</td>
          <td>${k.search_volume || 0}</td>
          <td>${escapeHtml(k.difficulty)}</td><td>${k.opportunity_score}</td><td>${escapeHtml(k.status)}</td>
          <td>${k.city_slug && k.service_slug ? `<a href="/city/${escapeHtml(k.city_slug)}/${escapeHtml(k.service_slug)}" target="_blank">查看</a>` : '-'}</td>
          <td><a href="/admin/keywords/${k.id}/edit">编辑</a> &nbsp; <form style="display:inline" method="post" action="/admin/keywords/${k.id}/delete" onsubmit="return confirm('确认删除该关键词及其AI落地页内容？删除后不可恢复。')"><button class="btn secondary" style="padding:2px 10px;color:#e5484d" type="submit">删除</button></form></td>
        </tr>`).join('')}
        </tbody>
      </table>
    </div>
  `,
  })
}

export function renderKeywordForm(kw: any, aiContent?: any, pageContact?: PageContactMethods): string {
  return renderAdminLayout({
    title: '编辑关键词', active: '/admin/keywords',
    body: `
    <h2>编辑关键词：${escapeHtml(kw.keyword)}</h2>
    <form class="admin-form" method="post" action="/admin/keywords/${kw.id}/edit">
      <label>真实搜索量（人工从第三方关键词工具核实后回填，用于重新计分）</label>
      <input type="number" name="search_volume" min="0" value="${kw.search_volume || 0}" />
      <label>难度</label>
      <select name="difficulty">
        ${['低', '中', '高'].map((d) => `<option value="${d}" ${kw.difficulty === d ? 'selected' : ''}>${d}</option>`).join('')}
      </select>
      <label>状态</label>
      <select name="status">
        ${['pending', 'published', 'ranking'].map((s) => `<option value="${s}" ${kw.status === s ? 'selected' : ''}>${s}</option>`).join('')}
      </select>
      <label>内容权重（自动取当前机会分，机会分越高，AI落地页内容应越完整）</label>
      <input value="${kw.opportunity_score || 0}" disabled />
      <p style="color:var(--muted);font-size:12px">对应落地页：${escapeHtml(kw.landing_slug || '-')}；AI内容：${aiContent?.content ? '已生成' : '尚未生成'}</p>
      <label>备注</label>
      <textarea name="note" rows="2">${escapeHtml(kw.note || '')}</textarea>
      
      <button class="btn" type="submit">保存并重新计分</button>
    </form>
    <form method="post" action="/admin/keywords/${kw.id}/ai-content" style="margin-top:10px"><button class="btn secondary" type="submit">🤖 AI 生成对应落地页内容</button></form>
    <form method="post" action="/admin/keywords/${kw.id}/content/delete" onsubmit="return confirm('确认删除该关键词落地页AI内容？删除后不可恢复。')" style="margin-top:10px"><button class="btn secondary" type="submit">删除落地页内容</button></form>
  `,
  })
}

export function renderCollectionLogsList(rows: any[], message = ''): string {
  return renderAdminLayout({
    title: '采集任务日志', active: '/admin/news-sources',
    body: `
    <div class="section-title">
      <h2>新闻采集任务运行日志</h2>
      <div class="admin-actions" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <a class="btn secondary" href="/admin/news-sources">← 返回采集源管理</a>
        <form method="post" action="/admin/collection-logs/delete-all" style="display:inline">
          <button class="btn danger" type="submit" onclick="return confirm('确认一键删除全部采集日志？删除后不可恢复。')">🗑 一键删除全部日志</button>
        </form>
      </div>
    </div>
    ${message ? `<div class="card" style="border-left:4px solid #1a8a4e;margin-bottom:16px">${escapeHtml(message)}</div>` : ''}
    <table>
      <thead><tr><th>来源</th><th>抓取条数</th><th>新建文章</th><th>已发布</th><th>错误</th><th>时间</th><th>操作</th></tr></thead>
      <tbody>
      ${rows.map((l) => `<tr>
        <td>${escapeHtml(l.source_name || '')}</td><td>${l.fetched_count}</td><td>${l.created_count}</td><td>${l.published_count}</td>
        <td style="color:#e5484d">${escapeHtml(l.error || '')}</td><td>${escapeHtml(l.created_at)}</td>
        <td><form method="post" action="/admin/collection-logs/${l.id}/delete" style="display:inline"><button class="btn secondary" type="submit" onclick="return confirm('确认删除这条采集日志？删除后不可恢复。')">删除日志</button></form></td>
      </tr>`).join('')}
      </tbody>
    </table>
  `,
  })
}

export function renderMessagesList(rows: any[], statusFilter?: string, message = ''): string {
  const tabs = [
    { key: '', label: '全部' },
    { key: 'new', label: '未读' },
    { key: 'replied', label: '已回复' },
    { key: 'read', label: '已读' },
  ]
  const statusLabel = (status: string) => {
    if (status === 'new') return '<span class="badge" style="background:#fff7e6;color:#ad6800">未读</span>'
    if (status === 'replied') return '<span class="badge" style="background:#e7f7ee;color:#1a8a4e">已回复</span>'
    return '<span class="badge">已读</span>'
  }
  const replyCount = (m: any) => Array.isArray(m.replies) ? m.replies.length : Number(m.reply_count || 0)
  const replyHtml = (m: any) => {
    const replies = Array.isArray(m.replies) ? m.replies : []
    return replies.length
      ? `
        <div style="margin:10px 0 14px;padding:10px 12px;background:var(--surface-2,#f8fafc);border-radius:8px">
          <strong style="font-size:13px">回复记录（${replies.length}）</strong>
          ${replies.map((r: any) => `
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border)">
              <div style="font-size:12px;color:var(--muted)">${escapeHtml(r.created_at || '')} · ${escapeHtml(r.operator || '管理员')} · ${escapeHtml(r.channel || '内部记录')}</div>
              <div style="white-space:pre-wrap;line-height:1.7;margin-top:4px">${escapeHtml(r.content || '')}</div>
            </div>`).join('')}
        </div>`
      : '<p style="margin:8px 0;color:var(--muted);font-size:12px">暂无回复记录。</p>'
  }
  return renderAdminLayout({
    title: '客户留言', active: '/admin/messages',
    body: `
    <div class="section-title"><h2>客户留言</h2><span style="color:var(--muted);font-size:12px">回复会保存到留言线程；支持客户邮箱字段；配置 RESEND_API_KEY + email_from 后，可在留言线程中直接发送邮箱回复。未配置邮箱通道时仍可使用电话、微信、QQ或内部记录。</span></div>
    ${message ? `<div class="card" style="border-left:4px solid #1a8a4e;margin-bottom:12px;color:#1a8a4e">${escapeHtml(message)}</div>` : ''}
    <div style="margin-bottom:12px">
      ${tabs.map((t) => `<a class="btn ${(statusFilter || '') === t.key ? '' : 'secondary'}" style="margin-right:8px;margin-bottom:6px" href="/admin/messages${t.key ? '?status=' + t.key : ''}">${t.label}</a>`).join('')}
    </div>
    ${rows.map((m) => `
      <div class="card" style="margin:12px 0">
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:flex-start">
          <div style="min-width:0;flex:1">
            <div style="font-weight:700;font-size:16px">${escapeHtml(m.name || '未填写姓名')}</div>
            <div style="margin-top:5px;color:var(--muted);font-size:12px">
              电话：${escapeHtml(m.phone || '-')} · 邮箱：${escapeHtml(m.email || '-')} · 城市：${escapeHtml(m.city || '-')} · 服务：${escapeHtml(m.service || '-')}
            </div>
          </div>
          <div>${statusLabel(String(m.status || 'new'))}</div>
        </div>
        <div style="margin-top:12px;padding:12px;background:var(--surface-2,#f8fafc);border-radius:8px">
          <div style="font-size:12px;color:var(--muted)">客户留言 · ${escapeHtml(m.created_at || '')}</div>
          <div style="white-space:pre-wrap;line-height:1.8;margin-top:5px">${escapeHtml(m.content || '')}</div>
        </div>
        ${replyHtml(m)}
        <details style="margin-top:10px">
          <summary style="cursor:pointer;font-weight:600">${replyCount(m) ? '继续回复（已有 ' + replyCount(m) + ' 条）' : '回复客户'}</summary>
          <form method="post" action="/admin/messages/${m.id}/reply" class="admin-form" style="margin-top:10px">
            <label>回复方式</label>
            <select name="channel">
              <option value="邮箱">邮箱</option>
              <option value="电话">电话</option>
              <option value="微信">微信</option>
              <option value="QQ">QQ</option>
              <option value="其他">其他</option>
              <option value="内部记录">内部记录</option>
            </select>
            <label>邮件主题（仅邮箱回复使用）</label>
            <input name="subject" maxlength="200" placeholder="例如：关于您提交的需求" />
            <label>回复内容</label>
            <textarea name="content" rows="4" maxlength="3000" required placeholder="填写准备回复客户的内容；邮箱发送成功后也会保存到留言回复记录。"></textarea>
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              ${m.email ? `<a class="btn secondary" href="mailto:${escapeHtml(m.email)}">✉️ 邮箱</a>` : ''}${m.phone ? `<a class="btn secondary" href="tel:${escapeHtml(m.phone)}">📞 拨打电话</a>` : ''}
              <button class="btn" type="submit">保存回复并标记为已回复</button>
            </div>
          </form>
        </details>
        <div style="margin-top:12px;display:flex;gap:10px;flex-wrap:wrap">
          ${m.status === 'new' ? `<form method="post" action="/admin/messages/${m.id}/read" style="display:inline"><button class="btn secondary" type="submit">标记已读</button></form>` : ''}
          <form method="post" action="/admin/messages/${m.id}/delete" style="display:inline" onsubmit="return confirm('确认删除该留言及其全部回复？删除后不可恢复。')"><button class="btn secondary" type="submit" style="color:#e5484d">删除留言及回复</button></form>
        </div>
      </div>`).join('')}
    ${rows.length ? '' : '<div class="card" style="color:var(--muted)">当前筛选条件下没有客户留言。</div>'}
  `,
  })
}

export function renderNewsSourcesList(rows: any[], collectedArticles: any[] = [], message = '', schedule: { enabled: boolean; time: string } = { enabled: false, time: '08:00' }): string {
  return renderAdminLayout({
    title: '新闻采集管理', active: '/admin/news-sources',
    body: `
    <div class="section-title"><h2>新闻采集管理</h2><div>
      <a href="/admin/collection-logs">查看采集日志 →</a>
      <form method="post" action="/admin/news-sources/collect" style="display:inline;margin-left:8px"><button class="btn" type="submit">🤖 立即采集并生成待审核 AI 解读稿</button></form>
    </div></div>
    ${message ? `<div class="card" style="border-left:4px solid ${message.startsWith('本轮') || message.startsWith('新闻采集完成') || message.startsWith('已创建') ? '#1a8a4e' : '#e5484d'};margin-bottom:16px">${escapeHtml(message)}</div>` : ''}
    <div class="card" style="margin:12px 0">
      <strong>新闻采集任务运行规则</strong>
      <p style="color:var(--muted);font-size:13px;line-height:1.8;margin:6px 0 0">
        每个采集来源都可以填写<strong>不同的来源地址</strong>；来源地址可以是 RSS / Atom / JSON 接口，也可以直接填写新闻网站的<strong>HTML 列表页地址</strong>。
        系统先抓来源地址；如果普通解析识别不到候选，自动让 AI 分析已抓取的列表页快照，识别标题、真实链接和页面证据，再进入原文页面读取资料。AI 只负责整理和独立解读，不直接转载原文；无法确认的链接不会被编造。
        原文章链接会保留在正文中。AI内容先通过标题、结构、事实边界、实际影响、执行步骤、风险提醒和 SEO 主题词等质量门槛；通过后统一进入 pending_review，必须由管理员人工审核后才能公开。
      </p>
    </div>
    <div class="card" style="margin:12px 0">
      <strong>定时采集任务</strong>
      <form method="post" action="/admin/news-sources/schedule" class="admin-form" style="margin-top:10px">
        <label><input type="checkbox" name="enabled" ${schedule.enabled ? 'checked' : ''} /> 启用定时新闻采集 + AI整理</label>
        <label>每天北京时间</label>
        <input type="time" name="collection_time" value="${escapeHtml(schedule.time || '08:00')}" step="300" required />
        <p style="color:var(--muted);font-size:12px;margin:0">按 5 分钟一个时间点设置，例如 08:00、08:05、12:30、18:30。保存后由 Cloudflare Cron 自动执行；每次采集都只生成待审核稿，不会自动公开。管理员审核通过后再手动发布。</p>
        <button class="btn" type="submit">保存定时任务时间</button>
      </form>
    </div>
    <div class="card" style="margin:12px 0">
      <strong>“继续提交创建”怎么用？</strong>
      <span style="color:var(--muted);font-size:13px">已经采集过的文章不会被系统重复自动创建。需要再次利用某条已采集内容时，点击下面的“继续提交创建”，系统会复制为一篇新的草稿，进入「内容管理」继续编辑、AI优化或发布，不删除原文章。</span>
    </div>
    <form class="admin-form" method="post" action="/admin/news-sources/new">
      <input name="name" placeholder="来源名称，如：国家业务总局" required />
      <label>来源地址（每个来源可使用不同的新闻列表页地址）</label>
      <input name="feed_url" type="url" placeholder="https://example.com/news 或 RSS/JSON 地址" required />
      <select name="credibility"><option>高</option><option selected>中</option><option>低</option></select>
      <button class="btn" type="submit">添加来源</button>
    </form>
    <table style="margin-top:16px">
      <thead><tr><th>来源</th><th>来源地址 / 列表页</th><th>可信度</th><th>上次抓取</th><th>操作</th></tr></thead>
      <tbody>
      ${rows.map((s) => `<tr>
        <td>${escapeHtml(s.name)}</td>
        <td style="max-width:360px;word-break:break-all"><a href="${escapeHtml(s.feed_url)}" target="_blank" rel="nofollow noopener">${escapeHtml(s.feed_url)}</a></td>
        <td>${escapeHtml(s.credibility)}</td>
        <td>${escapeHtml(s.last_fetched_at || '未抓取')}</td>
        <td>
          <form method="post" action="/admin/news-sources/${s.id}/collect" style="display:inline"><button class="btn secondary" type="submit">立即抓取</button></form>
          <form method="post" action="/admin/news-sources/${s.id}/analyze" style="display:inline;margin-left:6px"><button class="btn secondary" type="submit">🤖 AI分析来源</button></form>
          &nbsp;<a href="/admin/news-sources/${s.id}/edit">修改内容链接</a>
          &nbsp;<form method="post" action="/admin/news-sources/${s.id}/delete" style="display:inline" onsubmit="return confirm('确认删除这个采集源？相关已采集文章不会删除。' )"><button class="btn secondary" style="padding:2px 10px;color:#e5484d" type="submit">删除</button></form>
        </td>
      </tr>`).join('')}
      </tbody>
    </table>
    <div class="card" style="margin-top:18px">
      <h3>已采集文章</h3>
      <p style="color:var(--muted);font-size:12px">这里列出 AI 新闻采集产生的独立解读文章。通过质量门槛后进入 pending_review，必须人工审核并明确发布；原文章只作为事实来源，原文章链接保留在内容里。</p>
      <table><thead><tr><th>标题</th><th>来源</th><th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>
      ${collectedArticles.map((a) => `<tr>
        <td>${escapeHtml(a.title)}</td>
        <td>${a.source_name ? '<a href="' + escapeHtml(a.source_url || '') + '" target="_blank" rel="nofollow noopener">' + escapeHtml(a.source_name) + '</a>' : '-'}</td>
        <td>${statusBadge(a.status || '')}</td>
        <td>${escapeHtml(a.created_at || '')}</td>
        <td>
          ${a.status === 'published' ? `<a href="/article/${encodeURIComponent(a.slug || String(a.id))}" target="_blank">查看前台</a> &nbsp;` : ''}
          <a href="/admin/articles/${a.id}/edit">编辑文章</a> &nbsp;\n          <a href="/admin/articles/${a.id}/preview" target="_blank">后台预览</a> &nbsp;
          <form method="post" action="/admin/news-sources/articles/${a.id}/recreate" style="display:inline"><button class="btn secondary" type="submit" onclick="return confirm('将根据这篇已采集文章创建一篇新的草稿，原文章不会改变。确认继续？')">继续提交创建</button></form>
          &nbsp;<form method="post" action="/admin/articles/${a.id}/delete" style="display:inline" onsubmit="return confirm('确认删除这篇采集文章？')"><button class="btn secondary" style="padding:2px 10px;color:#e5484d" type="submit">删除</button></form>
        </td>
      </tr>`).join('')}
      </tbody></table>
    </div>
  `,
  })
}

export function renderGeoPage(opts: {
  siteUrl: string
  aiCrawlersEnabled: boolean
  llmsEnabled: boolean
  saved?: boolean
}): string {
  const crawlers = ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Bytespider']
  return renderAdminLayout({
    title: 'GEO / AI 搜索', active: '/admin/geo',
    body: `
    <div class="section-title"><h2>🧭 GEO / AI 搜索</h2><a href="/admin/seo">SEO / 自然收录 →</a></div>
    <p class="admin-help">GEO 不是“保证被 AI 引用”，而是让 AI/Agent 更容易理解网站主题、找到公开页面并正确引用。这里统一查看 <code>/llms.txt</code>、AI 爬虫白名单和结构化数据；最终是否抓取、索引或引用仍由对应平台决定。</p>
    ${opts.saved ? '<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:16px">GEO 设置已保存。</div>' : ''}
    <div class="grid grid-3">
      <div class="card">
        <h3 style="margin-top:0">llms.txt</h3>
        <p style="font-size:12px;color:var(--muted);line-height:1.8">动态生成站点主题、服务、城市、最新公开文章、内容可信规则和 Sitemap。建议保持开启，不手工复制整站内容。</p>
        <p><a class="btn secondary" href="/llms.txt" target="_blank">查看 /llms.txt</a></p>
        <span class="badge">${opts.llmsEnabled ? '已启用' : '已关闭'}</span>
      </div>
      <div class="card">
        <h3 style="margin-top:0">AI 爬虫白名单</h3>
        <p style="font-size:12px;color:var(--muted);line-height:1.8">开启后，robots.txt 会显式 Allow 主要 AI/答案引擎爬虫，同时继续禁止 /admin、/api、/healthz、/search。</p>
        <div style="font-size:12px;line-height:1.8">${crawlers.map((name) => '<code>' + escapeHtml(name) + '</code>').join(' · ')}</div>
        <p style="margin-top:10px"><a class="btn secondary" href="/robots.txt" target="_blank">查看 robots.txt</a></p>
        <span class="badge">${opts.aiCrawlersEnabled ? '已允许' : '仅通用规则'}</span>
      </div>
      <div class="card">
        <h3 style="margin-top:0">结构化数据</h3>
        <p style="font-size:12px;color:var(--muted);line-height:1.8">模板自动输出 Organization、WebSite、WebPage；文章页输出 Article，服务页输出 Service，城市页输出 WebPage/City。不要在 AI 提示词里重复生成 JSON-LD。</p>
        <span class="badge">自动输出</span>
        <p style="font-size:12px;margin-top:10px"><a href="https://search.google.com/test/rich-results" target="_blank" rel="noopener noreferrer">Google Rich Results Test →</a></p>
      </div>
    </div>
    <form class="admin-form card" method="post" action="/admin/geo" style="margin-top:16px">
      <h3 style="margin-top:0">GEO 控制</h3>
      <label style="display:flex;align-items:center;gap:10px"><input type="checkbox" name="geo_ai_crawlers_enabled" ${opts.aiCrawlersEnabled ? 'checked' : ''} /> 显式允许主要 AI/答案引擎爬虫</label>
      <label style="display:flex;align-items:center;gap:10px"><input type="checkbox" name="geo_llms_enabled" ${opts.llmsEnabled ? 'checked' : ''} /> 发布 /llms.txt</label>
      <p style="font-size:12px;color:var(--muted);line-height:1.8">这两个开关只控制 GEO 辅助入口，不会隐藏正常公开页面，也不会改变 Sitemap。关闭 AI 爬虫白名单时，robots.txt 仍允许普通搜索引擎抓取公开内容。</p>
      <button class="btn" type="submit">保存 GEO 设置</button>
    </form>
    <div class="card" style="margin-top:16px">
      <h3 style="margin-top:0">上线检查</h3>
      <ul>
        <li>站点主题、行业、核心服务先在「系统设置」填写，GEO 文档会自动读取。</li>
        <li>保持公开服务、城市、已发布文章可访问；不要为了 GEO 把后台、API 或搜索结果页开放给爬虫。</li>
        <li>发布文章后先人工核验事实，再依靠 Sitemap/通知和 AI 可抓取页面进行发现。</li>
        <li>结构化数据只描述页面真实内容；不要虚构评分、评论、价格、资质等字段。</li>
      </ul>
    </div>
  `
  })
}

export function renderSeoPage(opts: {
  siteUrl: string
  recentLogs: any[]
  successCount: number
  failureCount: number
  engine?: string
  result?: string
  q?: string
  channels?: Record<string, boolean>
  notifyStarted?: boolean
  notifyCount?: number
}): string {
  const engine = opts.engine || ''
  const result = opts.result || ''
  const q = opts.q || ''
  const channels = opts.channels || {}
  const isSuccess = (status: number) => status >= 200 && status < 300
  const channelItems: Array<{ key: string; name: string; status: boolean | 'manual'; desc: string }> = [
    { key: 'indexnow', name: 'IndexNow', status: channels.indexnow, desc: '人工审核并发布后自动通知公开 URL；更新和删除公开 URL 也会通知。' },
    { key: 'bing', name: 'Bing / IndexNow', status: channels.indexnow, desc: 'Bing 自动 URL 通知使用 IndexNow；不依赖旧的 Bing SOAP/POX 接口。' },
    { key: 'baidu', name: '百度普通收录', status: channels.baidu, desc: channels.baidu ? '已配置 token，可主动提交发布 URL。' : '未配置 token：继续依靠 sitemap.xml、robots.txt 和站内链接自然发现。' },
    { key: 'google', name: 'Google', status: channels.google, desc: '普通页面使用 Sitemap + Search Console；不把通用 Indexing API 当普通文章批量提交接口。' },
    { key: '360', name: '360 搜索', status: false, desc: '使用 sitemap.xml、robots.txt 和官方站长平台；模板不硬编码未经验证的推送接口。' },
    { key: 'sogou', name: '搜狗搜索', status: false, desc: '使用 sitemap.xml、robots.txt 和官方站长平台；模板不硬编码未经验证的推送接口。' },
    { key: 'baidu-ai', name: '百度 AI 搜索', status: 'manual', desc: '通过公开页面、结构化数据和 AI 搜索站长工具观察抓取、曝光与引用；不把普通收录当成 AI 引用保证。' },
    { key: 'video', name: '国内视频/内容平台', status: 'manual', desc: '人工发布后自动生成抖音、快手、小红书、哔哩哔哩发布包；第三方账号外发仍需按官方授权流程人工发布。' },
  ]
  return renderAdminLayout({
    title: 'SEO / 自然收录', active: '/admin/seo',
    body: `
    <div class="section-title"><h2>SEO / 自然收录</h2><a href="/admin/keywords">统一 SEO 关键词 →</a></div>
    <p style="color:var(--muted);font-size:13px;line-height:1.8">这里负责已发布 URL 的自然发现、抓取和可索引基础。<strong>没有 token 也不等于不能被收录</strong>：网站仍会通过公开的 sitemap.xml、robots.txt 和站内链接让搜索引擎自行发现和抓取；token 只是用于更主动的 URL 提交通知，不能保证立即收录。</p>

    <div class="grid grid-4" style="margin-bottom:16px">
      <div class="card" style="margin-bottom:16px">
      <h3 style="margin-top:0">没有 token，怎么被收录？</h3>
      <p style="color:var(--muted);font-size:13px;line-height:1.9;margin-bottom:0">
        <strong>① Sitemap：</strong><a href="/sitemap.xml" target="_blank">${opts.siteUrl}/sitemap.xml</a> 只列公开、正常可访问的 SEO URL；
        <strong>② Robots：</strong><a href="/robots.txt" target="_blank">${opts.siteUrl}/robots.txt</a> 放行公开内容，并声明 Sitemap；
        <strong>③ 站内链接：</strong>首页 → 城市/服务/文章 → 城市×服务页面形成可爬链接路径，同时避免链接到低机会分或外站跳转页面；
        <strong>④ 收录通知：</strong>点击下面“通知搜索引擎”后，系统会把当前公开 URL 的变更提交给已配置的 IndexNow/百度/360/搜狗等渠道。
        这些机制可以改善发现与抓取，但不能保证搜索引擎一定收录；Bing 官方也明确说明 IndexNow 不保证抓取或索引，最终是否建立索引由搜索引擎自行判断。
      </p>
    </div>

    <div class="card"><strong>成功记录</strong><div style="font-size:28px;margin-top:6px;color:#1a8a4e">${opts.successCount}</div></div>
      <div class="card"><strong>失败记录</strong><div style="font-size:28px;margin-top:6px;color:#e5484d">${opts.failureCount}</div></div>
      <div class="card"><strong>Sitemap</strong><div style="margin-top:6px"><a href="/sitemap.xml" target="_blank">打开 sitemap.xml</a></div><div style="margin-top:6px;color:var(--muted);font-size:12px">Sitemap 不是“收录结果”，只是公开 URL 清单。已发布文章、启用城市/服务及符合机会分条件的落地页才会进入；搜索引擎是否真正收录要看抓取与索引状态。</div></div>
      <div class="card"><strong>Robots</strong><div style="margin-top:6px"><a href="/robots.txt" target="_blank">打开 robots.txt</a></div></div>
    </div>

    <div class="card" style="margin-bottom:16px">
      <h3 style="margin-top:0">搜索引擎渠道</h3>
      <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px">
        ${channelItems.map((item) => `
          <div style="border:1px solid var(--border);border-radius:10px;padding:12px">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center">
              <strong>${item.name}</strong>
              <span class="badge">${item.status ? '已配置' : '未启用/手动提交'}</span>
            </div>
            <p style="color:var(--muted);font-size:12px;line-height:1.6;margin:7px 0 0">${item.desc}</p>
          </div>`).join('')}
      </div>
    </div>

    <div class="card">
      <p><strong>自然收录优先：</strong>发布文章后 URL 会立即进入动态 Sitemap；后台随后异步通知已配置的百度普通收录、IndexNow/Bing，并记录提交日志。Google 普通文章使用 Search Console/Sitemap；360、搜狗以 Sitemap 与自然抓取为主。国内视频/内容平台同步生成发布包。<br/>IndexNow Key 文件：${opts.siteUrl}/&lt;key&gt;.txt。统一 SEO 关键词：<a href="/admin/keywords">进入固定关键词设置 →</a></p>
      <form method="post" action="/admin/seo/auto-fill" style="display:inline-block;margin:0 8px 8px 0" onsubmit="return confirm(&quot;仅补齐城市、服务、已发布文章的 SEO 标题、描述和 3-5 个主题词，不修改正文、固定候选词库、Sitemap 或 Robots。继续？&quot;)">
        <button class="btn secondary" type="submit">一键补齐内容页 SEO</button>
      </form>
      <form method="post" action="/admin/seo/submit" style="display:inline-block;margin:0 8px 8px 0" onsubmit="return confirm('将当前 Sitemap 中的公开 URL 提交给已配置的搜索引擎通知渠道。通知不等于已经收录。继续？')">
        <button class="btn" type="submit">📣 通知搜索引擎</button>
      </form>
      ${opts.notifyStarted ? '<div style="margin-top:8px;color:#1a8a4e;font-size:12px">已启动收录通知：当前公开 URL ' + escapeHtml(String(opts.notifyCount || 0)) + ' 个；实际接收和后续抓取状态请查看下方推送结果。</div>' : ''}
      <a class="btn secondary" href="/admin/seo">清除查询条件</a>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>推送结果查询</h3>
      <form method="get" action="/admin/seo" class="admin-form" style="display:grid;grid-template-columns:1fr 1fr 2fr auto;gap:10px;align-items:end">
        <div><label>推送渠道</label>
          <select name="engine">
            <option value="">全部</option>
            ${['indexnow','bing','baidu','360','sogou','google'].map((e) => `<option value="${e}" ${engine === e ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>
        <div><label>结果</label>
          <select name="result">
            <option value="" ${result === '' ? 'selected' : ''}>全部</option>
            <option value="success" ${result === 'success' ? 'selected' : ''}>成功</option>
            <option value="failure" ${result === 'failure' ? 'selected' : ''}>失败</option>
          </select>
        </div>
        <div><label>URL / 返回内容查询</label><input name="q" value="${escapeHtml(q)}" placeholder="例如：example.com/article/ 或 429" /></div>
        <button class="btn" type="submit">查询</button>
      </form>
    </div>

    <div class="card" style="margin-top:16px">
      <h3>推送明细</h3>
      <div style="overflow:auto">
      <table>
        <thead><tr><th>渠道</th><th>URL</th><th>结果</th><th>HTTP</th><th>返回内容</th><th>时间</th><th>操作</th></tr></thead>
        <tbody>
        ${opts.recentLogs.map((l) => {
          const status = Number(l.status_code || 0)
          const skipped = status === 0 && /(基础模板|不调用|不重复调用|请在|手动)/.test(String(l.response || ''))
          const ok = isSuccess(status) && !skipped
          const deprecated = l.engine === 'google-ping' || l.engine === 'bing-ping'
          return `<tr>
            <td>${escapeHtml(l.engine)}${deprecated ? ' <span class="badge">历史废弃</span>' : ''}</td>
            <td style="max-width:320px;word-break:break-all">${escapeHtml(l.url)}</td>
            <td>${skipped ? '<span class="badge">跳过 / 手动</span>' : ok ? '<span class="badge" style="background:#e7f7ee;color:#1a8a4e">成功</span>' : '<span class="badge" style="background:#fdeaea;color:#e5484d">失败</span>'}</td>
            <td>${status || '-'}</td>
            <td style="max-width:460px;white-space:pre-wrap;word-break:break-word;font-size:12px">${escapeHtml(l.response || '')}</td>
            <td>${escapeHtml(l.created_at || '')}</td>
            <td>${!ok && !skipped ? '<form method="post" action="/admin/seo/logs/' + l.id + '/retry" style="display:inline;margin-right:6px"><button class="btn secondary" type="submit" onclick="return confirm(\'将这个 URL 重新提交到已配置的自动通知渠道。继续？\')">重试</button></form>' : ''}<form method="post" action="/admin/seo/logs/${l.id}/delete" style="display:inline"><button class="btn secondary" type="submit" onclick="return confirm('确认删除这条推送日志？')">删除</button></form></td>
          </tr>`
        }).join('')}
        </tbody>
      </table>
      </div>
      ${opts.recentLogs.length ? '' : '<p style="color:var(--muted)">没有符合条件的推送记录。</p>'}
    </div>
    <div class="card" style="margin-top:16px">
      <strong>Google / Sitemap 说明</strong>
      <p style="color:var(--muted);font-size:12px;line-height:1.8;margin-bottom:0">Google 已停止 Sitemap Ping；本系统不再自动调用任何 Sitemap Ping；网站继续提供 ${opts.siteUrl}/sitemap.xml，并建议在 Google Search Console 中提交。Google Indexing API 不能作为普通行业页面的通用提交接口。</p>
    </div>
    <p style="margin-top:10px"><a href="/admin/collection-logs">查看新闻采集任务运行日志 →</a></p>
  `,
  })
}

export function renderPageSettingsPage(pages: any[], current?: any, error = '', image?: any, pageContact?: PageContactMethods): string {
  const p = current
  return renderAdminLayout({
    title: p ? `编辑页面：${escapeHtml(p.label)}` : '页面管理', active: '/admin/pages',
    body: `
    <div class='section-title'><h2>页面管理</h2><a href='/admin/pages' style='color:var(--muted);font-size:13px'>返回页面列表</a></div>
    <p style='color:var(--muted);font-size:13px'>页面列表是唯一的页面管理入口。标题/副标题只负责页面头部；正文属于 SEO 与信息补充，统一显示在前台页面主体底部的固定内容区，不参与服务卡片、城市列表、资讯卡片等主布局。这样编辑正文不会把页面结构顶乱；正文可留空，页面核心数据模块仍按标准模板展示。</p>
    ${error ? `<div class='card' style='border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px'>${escapeHtml(error)}</div>` : ''}
    <div class='card' style='margin-bottom:16px'><h3 style='margin-top:0'>页面列表</h3>
      <div class='admin-table-wrap'><table><thead><tr><th>页面</th><th>模式</th><th>前台地址</th><th>标题 / 副标题</th><th>内容</th><th>操作</th></tr></thead><tbody>
      ${pages.map((item) => `<tr><td>${escapeHtml(item.labelZh || item.label)}<br/><span style='color:var(--muted);font-size:11px'>${escapeHtml(item.labelEn || '')}</span></td><td><span class='badge'>${escapeHtml(item.mode === 'external' ? '外站链接' : item.mode === 'hidden' ? '隐藏' : '本站内容')}</span></td><td><a href='${escapeHtml(item.path)}' target='_blank'>${escapeHtml(item.path)}</a></td><td>${escapeHtml(item.titleZh || item.titleEn || '系统默认')}<br/><span style='color:var(--muted);font-size:12px'>${escapeHtml(item.subtitleZh || item.subtitleEn || '')}</span></td><td>${item.contentZh || item.contentEn ? '已设置' : '系统默认'}</td><td>${item.seoAudit ? `<span class='badge'>SEO ${item.seoAudit.score} · ${escapeHtml(item.seoAudit.label)}</span><br/>` : ''}<a class='btn secondary' style='display:inline-block;margin-top:5px' href='/admin/pages/${escapeHtml(item.key)}/edit'>编辑 / AI写作</a> &nbsp; <a href='${escapeHtml(item.path)}' target='_blank'>打开前台</a></td></tr>`).join('')}
      </tbody></table></div></div>
    ${p ? `
    ${p.mode === 'internal' ? `<div class='card' style='margin-bottom:16px;background:#f8fbff;border-color:#dbe7f7'><div style='display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap'><div><strong>🤖 AI 页面写作 + SEO</strong><div style='color:var(--muted);font-size:12px;line-height:1.7;margin-top:5px'>AI 生成标题、简介、正文和 3-5 个主题词；正文会进入固定内容区，生成后再参加项目内 SEO 结构检查。</div></div><form method='post' action='/admin/pages/${escapeHtml(p.key)}/ai-content' style='margin:0'><button class='btn secondary' type='submit'>🤖 AI生成/优化页面</button></form></div></div>` : ''}
    <div class='card' style='margin-bottom:16px'><h3 style='margin-top:0'>编辑：${escapeHtml(p.label)}</h3>
      <p style='color:var(--muted);font-size:12px'>本站地址：<a href='${escapeHtml(p.path)}' target='_blank'>${escapeHtml(p.path)}</a>。选择“外站链接”后，前台访问这个地址会直接跳转到外站。</p>
    </div>
    <form class='admin-form' method='post' action='/admin/pages/${escapeHtml(p.key)}/edit'>
      <fieldset style='border:1px solid var(--border);border-radius:8px;padding:12px'><legend style='padding:0 6px;font-size:13px;color:var(--muted)'>前台页面标签</legend>
        <p style='color:var(--muted);font-size:12px'>这里控制前台导航显示的页面标签；不是页面正文标题。保存后前台导航会同步更新。</p>
        <label>中文标签</label><input name='label_zh' value='${escapeHtml(p.labelZh || p.label || '')}' maxlength='60' placeholder='例如：行业资讯' />
        <label>English label</label><input name='label_en' value='${escapeHtml(p.labelEn || '')}' maxlength='60' placeholder='例如：Insights' />
      </fieldset>
      <label>页面模式</label>
      <select name='mode'><option value='internal' ${p.mode === 'internal' ? 'selected' : ''}>本站页面（使用后台内容）</option><option value='external' ${p.mode === 'external' ? 'selected' : ''}>外站链接（直接跳转）</option><option value='hidden' ${p.mode === 'hidden' ? 'selected' : ''}>隐藏页面</option></select>
      <label>外站链接（仅外站链接模式生效）</label>
      <input name='external_url' value='${escapeHtml(p.externalUrl || '')}' placeholder='https://example.com/your-page' />
      <fieldset style='border:1px solid var(--border);border-radius:8px;padding:12px'><legend style='padding:0 6px;font-size:13px;color:var(--muted)'>中文内容</legend>
        <label>页面标题</label><input name='title_zh' value='${escapeHtml(p.titleZh || '')}' placeholder='留空使用系统默认标题' />
        <label>页面副标题</label><textarea name='subtitle_zh' rows='2' placeholder='留空使用系统默认说明'>${escapeHtml(p.subtitleZh || '')}</textarea>
        <label>SEO / 页面补充正文（固定内容区）</label><textarea name='content_zh' rows='8' maxlength='12000' placeholder='可选。围绕页面主题补充真实业务信息、适用对象、服务范围、办理流程、注意事项和行动建议；前台固定显示在页面底部，不会改变主卡片布局。'>${escapeHtml(p.contentZh || '')}</textarea>
        <label>SEO主题词（可选，建议 3-5 个）</label><input name='seo_keywords_zh' value='${escapeHtml(p.seoKeywordsZh || '')}' maxlength='300' placeholder='例如：主题词A,主题词B,主题词C' />
      </fieldset>
      <fieldset style='border:1px solid var(--border);border-radius:8px;padding:12px'><legend style='padding:0 6px;font-size:13px;color:var(--muted)'>English content</legend>
        <label>Page title</label><input name='title_en' value='${escapeHtml(p.titleEn || '')}' placeholder='Leave empty to use the default title' />
        <label>Page subtitle</label><textarea name='subtitle_en' rows='2' placeholder='Leave empty to use the default description'>${escapeHtml(p.subtitleEn || '')}</textarea>
        <label>SEO / page information content (fixed content area)</label><textarea name='content_en' rows='8' maxlength='12000' placeholder='Optional. Add useful page information; it is rendered in the fixed information area at the bottom of the page and does not change the main card/list layout.'>${escapeHtml(p.contentEn || '')}</textarea>
        <label>SEO keywords（3-5）</label><input name='seo_keywords_en' value='${escapeHtml(p.seoKeywordsEn || '')}' maxlength='300' placeholder='e.g. enterprise services, consulting, project solutions' />
      </fieldset>
      <label style='display:flex;align-items:center;gap:8px'><input type='checkbox' name='show_form' ${p.showForm !== false ? 'checked' : ''} /> 前台显示留言表单</label>
      <button class='btn' type='submit'>保存并更新前台</button>
    </form>
    ${p.key === 'home' ? `<div class='card' style='margin-top:16px'><h3 style='margin-top:0'>首页图片（R2）</h3>${image?.url ? `<img src='${escapeHtml(image.url)}' alt='首页图片' style='display:block;max-width:480px;width:100%;border-radius:8px;margin-bottom:10px' />` : '<p style="color:var(--muted);font-size:12px">暂未设置首页图片。</p>'}<form class='admin-form' method='post' action='/admin/page-images/home' enctype='multipart/form-data'><input type='file' name='file' accept='image/jpeg,image/png,image/webp' required /><button class='btn' type='submit'>上传/替换首页图片</button></form>${image?.url ? `<form method='post' action='/admin/page-images/home/delete' style='display:inline' onsubmit="return confirm('确认删除首页图片？R2 文件将直接删除。')"><button class='btn secondary' style='color:#e5484d' type='submit'>删除首页图片</button></form>` : ''}</div>` : ''}
    <form method='post' action='/admin/pages/${escapeHtml(p.key)}/clear' onsubmit="return confirm('确认清空这个页面的后台内容？删除后不能恢复。')" style='margin-top:12px'><button class='btn secondary' type='submit'>删除本页后台内容</button></form>
    ` : ''}
  `,
  })
}

export function renderAiSettingsPage(settings: {
  enabled: boolean
  provider: 'workers_ai' | 'openai_compatible'
  model: string
  temperature: number
  maxTokens: number
  externalBaseUrl: string
  externalModel: string
  externalTimeoutMs: number
  fallbackEnabled: boolean
  externalApiKeyConfigured?: boolean
  saved?: boolean
  test?: string
  testModel?: string
  testProvider?: string
  testResponse?: string
  testMessage?: string
  testTask?: string
  testQuality?: string
}): string {
  const modelOptions = [
    { id: '@cf/meta/llama-3.1-8b-instruct-fast', label: 'Llama 3.1 8B Fast（当前默认）', note: '速度快，适合批量新闻/城市/服务/文章生成' },
    { id: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', label: 'Llama 3.3 70B Fast', note: '更强的长文本理解与生成能力，资源消耗更高' },
    { id: '@cf/meta/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', note: '新一代多模态模型，可用于较复杂内容生成' },
    { id: '@cf/meta/llama-3.1-8b-instruct-fp8', label: 'Llama 3.1 8B FP8', note: '标准 Cloudflare 托管版本' },
  ]
  const isKnownModel = modelOptions.some((m) => m.id === settings.model)
  const activeTestModel = settings.testModel || (settings.provider === 'workers_ai' ? settings.model : settings.externalModel)
  return renderAdminLayout({
    title: 'AI 设置', active: '/admin/ai-settings',
    body: `
    <div class="section-title"><h2>🤖 AI 设置</h2></div>
    <p style="color:var(--muted);font-size:13px;max-width:900px">
      这里统一控制全站 AI。默认继续使用 Cloudflare Workers AI；也可以切换到任意兼容 OpenAI Chat Completions 接口的第三方模型 API。
      新闻采集、城市/服务页面、文章正文/SEO、关键词落地页和多平台文案都会通过同一个 AI 路由。
    </p>
    ${settings.saved ? '<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:16px">AI 设置已保存，新的生成请求会立即使用新配置。</div>' : ''}
    ${settings.test === 'ok' ? `<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:16px"><strong>AI 测试正常</strong><br><small>任务：${escapeHtml(settings.testTask === 'city' ? '城市页真实内容' : settings.testTask === 'article' ? '文章真实内容' : '基础连通性')}；通道：${escapeHtml(settings.testProvider === 'openai_compatible' ? '外部 OpenAI-compatible API' : 'Workers AI')}；模型：${escapeHtml(activeTestModel || settings.model)}</small><div style="margin-top:6px">${escapeHtml(settings.testQuality || '')}</div><pre style="white-space:pre-wrap;max-height:300px;overflow:auto;color:var(--text)">${escapeHtml(settings.testResponse || '')}</pre></div>` : ''}
    ${settings.test === 'disabled' ? '<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px"><strong>AI 当前已关闭</strong><br><small>请先打开“启用 AI 内容生成”，保存后再测试。</small></div>' : ''}
    ${settings.test === 'empty' ? '<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px"><strong>AI 调用成功，但没有解析到返回文本</strong></div>' : ''}
    ${settings.test === 'error' ? `<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px"><strong>AI 测试失败</strong><br><small>${escapeHtml(settings.testMessage || '未知错误')}</small></div>` : ''}

    <form class="admin-form" method="post" action="/admin/ai-settings">
      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-top:0">① AI 总开关</h3>
        <label style="display:flex;align-items:center;gap:10px">
          <input type="checkbox" name="ai_enabled" ${settings.enabled ? 'checked' : ''} />
          <span>启用 AI 内容生成</span>
        </label>
        <p style="color:var(--muted);font-size:12px">关闭后不会删除已有内容；定时新闻任务和手动 AI 生成都不会调用模型。</p>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-top:0">② AI 通道</h3>
        <label>主要 AI 提供方</label>
        <select name="ai_provider" id="aiProvider">
          <option value="workers_ai" ${settings.provider === 'workers_ai' ? 'selected' : ''}>Cloudflare Workers AI（现有）</option>
          <option value="openai_compatible" ${settings.provider === 'openai_compatible' ? 'selected' : ''}>第三方 OpenAI-compatible API</option>
        </select>
        <p style="color:var(--muted);font-size:12px;line-height:1.8">
          第三方 API 只需要一个 HTTPS API Base URL + 模型名；API Key 不保存在 D1，也不会写进 Git。
          Cloudflare Worker 使用标准 \`fetch()\` 调用外部 API。
        </p>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-top:0">③ Workers AI 模型</h3>
        <label>Workers AI 模型</label>
        <select name="ai_model">
          ${modelOptions.map((m) => `<option value="${escapeHtml(m.id)}" ${settings.model === m.id ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('')}
        </select>
        <p style="color:var(--muted);font-size:12px;margin-bottom:8px">${escapeHtml((isKnownModel ? modelOptions.find((m) => m.id === settings.model)?.note : '当前为自定义模型ID') || '')}</p>
        <label>自定义 Workers AI 模型 ID（可选）</label>
        <input name="ai_custom_model" placeholder="@cf/..." value="${isKnownModel ? '' : escapeHtml(settings.model)}" />
        <p style="color:var(--muted);font-size:12px">仅接受 Cloudflare Workers AI 模型 ID（例如 \`@cf/...\` 或 \`@hf/...\`）。</p>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-top:0">⑤ 外部 AI API Key</h3>
        <p style="color:var(--muted);font-size:12px;line-height:1.8">仅在选择“第三方 OpenAI-compatible API”时使用。保存后加密存储在 D1，后台不会回显原始 Key；不填写不会删除已有 Key。</p>
        <label>API Key</label>
        <input name="external_ai_api_key" type="password" autocomplete="new-password" placeholder="留空保持不变" />
        <p style="font-size:12px;color:var(--muted)">当前状态：<strong>${settings.externalApiKeyConfigured ? "已配置" : "未配置"}</strong></p>
      </div>
<div class="card" id="externalAiCard" style="margin-bottom:16px">
        <h3 style="margin-top:0">④ 第三方 AI API</h3>
        <p style="color:var(--muted);font-size:12px;line-height:1.8">
          当前实现使用 OpenAI-compatible 的 \`/chat/completions\` 格式。可接入提供该兼容接口的模型服务；例如服务商通常会提供类似 \`https://example.com/v1\` 的 Base URL。
        </p>
        <label>API Base URL</label>
        <input name="ai_external_base_url" maxlength="500" value="${escapeHtml(settings.externalBaseUrl || '')}" placeholder="https://api.example.com/v1" autocomplete="off" />
        <label>模型名称</label>
        <input name="ai_external_model" maxlength="180" value="${escapeHtml(settings.externalModel || '')}" placeholder="例如 provider-model-name" autocomplete="off" />
        <label>请求超时（毫秒）</label>
        <input type="number" name="ai_external_timeout_ms" min="5000" max="60000" step="1000" value="${settings.externalTimeoutMs}" />
        <label style="display:flex;align-items:center;gap:10px;margin-top:10px">
          <input type="checkbox" name="ai_fallback_enabled" ${settings.fallbackEnabled ? 'checked' : ''} />
          <span>主通道失败时，最多自动调用 1 次备用通道</span>
        </label>
        <p style="color:var(--muted);font-size:12px">
          外部 API Key 固定使用 Cloudflare Secret 名称 <code>EXTERNAL_AI_API_KEY</code>。不要填在这里。
          未配置这个 Secret 时，外部通道测试会直接提示缺少 Key。
        </p>
      </div>

      <div class="card" style="margin-bottom:16px">
        <h3 style="margin-top:0">⑤ 生成参数</h3>
        <label>Temperature（随机性）</label>
        <input type="number" name="ai_temperature" min="0" max="5" step="0.1" value="${settings.temperature}" />
        <p style="color:var(--muted);font-size:12px">行业 SEO 内容通常建议 0.4–0.8；外部服务是否支持该范围由服务商接口决定。</p>
        <label>最大输出长度（Token）</label>
        <input type="number" name="ai_max_tokens" min="256" max="4096" step="128" value="${settings.maxTokens}" />
        <p style="color:var(--muted);font-size:12px">控制单次输出长度。越大，单次请求产生的处理和第三方模型费用也可能越高。</p>
      </div>

      <button class="btn" type="submit">保存 AI 设置</button>
    </form>

    <div class="card" style="margin-top:16px;max-width:900px">
      <h3 style="margin-top:0">AI 诊断测试</h3>
      <p style="color:var(--muted);font-size:12px;line-height:1.8">基础连通性只能证明模型能返回文本。为避免“AI测试成功但文章无法保存”，这里增加真实内容任务测试：城市页/文章会走与正式生成相同的 JSON/HTML/长度质量链路，但不会写入业务数据。</p>
      <form method="post" action="/admin/ai-settings/test" style="display:flex;gap:10px;align-items:end;flex-wrap:wrap">
        <div><label>测试任务</label><select name="test_task"><option value="connectivity">基础连通性</option><option value="city">城市页真实内容</option><option value="article">文章真实内容</option></select></div>
        <button class="btn secondary" type="submit">🧪 运行诊断</button>
      </form>
      <p style="font-size:12px;color:var(--muted);margin:10px 0 0">推荐：模型或提示词修改后，至少运行一次“城市页真实内容”或“文章真实内容”。</p>
    </div>

    <div class="card" style="margin-top:16px;max-width:900px">
      <h3 style="margin-top:0">当前配置</h3>
      <table><tbody>
        <tr><th style="text-align:left">状态</th><td>${settings.enabled ? '已启用' : '已停用'}</td></tr>
        <tr><th style="text-align:left">主要通道</th><td>${settings.provider === 'workers_ai' ? 'Cloudflare Workers AI' : '第三方 OpenAI-compatible API'}</td></tr>
        <tr><th style="text-align:left">Workers AI 模型</th><td><code>${escapeHtml(settings.model)}</code></td></tr>
        <tr><th style="text-align:left">外部 Base URL</th><td><code>${escapeHtml(settings.externalBaseUrl || '未配置')}</code></td></tr>
        <tr><th style="text-align:left">外部模型</th><td><code>${escapeHtml(settings.externalModel || '未配置')}</code></td></tr>
        <tr><th style="text-align:left">备用通道</th><td>${settings.fallbackEnabled ? '启用（最多 1 次）' : '关闭'}</td></tr>
        <tr><th style="text-align:left">最大输出</th><td>${settings.maxTokens} Token</td></tr>
      </tbody></table>
    </div>

    <script>
    (function(){
      var provider = document.getElementById('aiProvider');
      var card = document.getElementById('externalAiCard');
      function sync(){
        var external = provider && provider.value === 'openai_compatible';
        if(card) card.style.opacity = external ? '1' : '0.72';
      }
      if(provider){ provider.addEventListener('change', sync); sync(); }
    })();
    </script>
  `,
  })
}

export function renderAiPromptsPage(settings: AiPromptSettings, saved = '', test: { status?: string; key?: string; provider?: string; model?: string; response?: string; error?: string } = {}): string {
  const items: Array<{ key: 'global' | AiPromptKey; title: string; desc: string; defaultPrompt: string }> = [
    { key: 'global', title: '全局规则', desc: '统一控制品牌语气、事实边界、单页单主题、3-5 个页面主题词和禁止堆词。', defaultPrompt: DEFAULT_AI_GLOBAL_PROMPT },
    { key: 'news', title: '新闻解读', desc: '外部新闻只作事实资料，生成独立解读并控制 SEO 字段。', defaultPrompt: DEFAULT_AI_PROMPTS.news },
    { key: 'city', title: '城市页面', desc: '围绕城市企业行业需求，不把全站候选词批量复制到城市页。', defaultPrompt: DEFAULT_AI_PROMPTS.city },
    { key: 'service', title: '服务页面', desc: '只讲当前服务；城市组合词只在城市×服务落地页中使用。', defaultPrompt: DEFAULT_AI_PROMPTS.service },
    { key: 'article', title: '文章生成', desc: '围绕标题和摘要的一个主问题写原创内容，关键词只作主题提示。', defaultPrompt: DEFAULT_AI_PROMPTS.article },
    { key: 'keyword', title: '关键词候选', desc: '发现候选词，不直接等于页面 SEO；候选最多 12 个，页面仍固定 3-5 个。', defaultPrompt: DEFAULT_AI_PROMPTS.keyword },
    { key: 'landing', title: '城市×服务', desc: '仅服务有正机会分的城市×服务落地页，聚焦单一组合搜索意图。', defaultPrompt: DEFAULT_AI_PROMPTS.landing },
    { key: 'page', title: '普通页面', desc: '首页、关于、联系等页面优先清晰信息与转化，不制造无关 SEO 词。', defaultPrompt: DEFAULT_AI_PROMPTS.page },
  ]
  const valueFor = (key: 'global' | AiPromptKey) => settings[key] || ''
  const savedLabel: Record<string, string> = {
    global: '全局提示词已保存', news: '新闻提示词已保存', city: '城市提示词已保存', service: '服务提示词已保存',
    article: '文章提示词已保存', keyword: '关键词提示词已保存', landing: '落地页提示词已保存', page: '页面提示词已保存',
    'global-reset': '全局提示词已恢复默认', 'news-reset': '新闻提示词已恢复默认', 'city-reset': '城市提示词已恢复默认',
    'service-reset': '服务提示词已恢复默认', 'article-reset': '文章提示词已恢复默认', 'keyword-reset': '关键词提示词已恢复默认',
    'landing-reset': '落地页提示词已恢复默认', 'page-reset': '页面提示词已恢复默认',
  }
  return renderAdminLayout({
    title: 'AI 提示词管理',
    active: '/admin/ai-prompts',
    body: `
    <div class="section-title"><h2>🧠 AI 提示词管理</h2><a href="/admin/ai-settings">模型与参数 →</a></div>
    <p class="admin-help">这里负责“教 AI 怎么写”。系统按“默认写作底线 → 自定义补充规则 → 当前页面资料 → 当前 AI 通道”组合。默认规则不会被自定义提示词删除，避免一句“写得专业一点”把 JSON、流程、风险或 SEO 规则一起覆盖。</p>
    ${test.status === 'ok' ? `<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:16px"><strong>「${escapeHtml(test.key || '')}」提示词测试成功</strong><div style="margin-top:6px;font-size:12px;color:var(--muted)">通道：${escapeHtml(test.provider === 'openai_compatible' ? '外部 OpenAI-compatible API' : 'Workers AI')}；模型：${escapeHtml(test.model || '')}</div><div style="margin-top:8px;color:var(--text);white-space:pre-wrap;max-height:360px;overflow:auto">${escapeHtml(test.response || '')}</div><small style="display:block;margin-top:8px;color:var(--muted)">测试不会写入业务数据；用于检查当前生效提示词能否得到文本/指定结构。</small></div>` : ''}
    ${test.status === 'disabled' ? '<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px"><strong>AI 当前已关闭</strong><div style="margin-top:6px">请先在「AI 设置」开启 AI 内容生成，再测试提示词。</div></div>' : ''}
    ${test.status === 'error' ? `<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px"><strong>提示词测试失败</strong><div style="margin-top:6px">${escapeHtml(test.error || '未知错误')}</div></div>` : ''}
    <div class="card" style="margin-bottom:16px;border-left:4px solid #7048e8">
      <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
        <div><strong>🏷️ 行业关键词自动识别</strong><p style="margin:6px 0 0;color:var(--muted);font-size:12px;line-height:1.8">AI 会读取当前站点行业、主题、核心服务、已有关键词，以及最近已发布文章和服务内容，识别可被公开内容证明的行业关键词，并写入「系统设置 → 行业关键词」。它不是盲目生成词，而是先从真实内容提取。</p></div>
        <form method="post" action="/settings/generate-industry-keywords"><button class="btn secondary" type="submit">🤖 自动识别并设置行业关键词</button></form>
      </div>
      <p style="margin:8px 0 0;font-size:12px;color:var(--muted)">建议：先完善站点行业、主题和核心服务，再运行一次；生成后人工检查，AI 后续写作会自动读取这些行业关键词。</p>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        <strong>提示词总览</strong>
        <span class="badge">自定义 ${Object.values(settings).filter(Boolean).length}/8</span>
        <span class="badge">默认 ${8 - Object.values(settings).filter(Boolean).length}/8</span>
        <span class="badge">页面 SEO 词 3-5 个</span>
      </div>
      <p style="color:var(--muted);font-size:12px;line-height:1.8;margin:8px 0 0">建议：全局规则写长期不变的写作底线；任务提示词负责“怎么组织、怎么展开、输出什么格式”。自定义提示词现在是补充层，默认规则仍会自动参与下一次生成。</p>
    </div>
    <div class="seo-policy-card">
      <div><strong>当前 SEO 内容策略</strong><span class="badge">网站主题 + 页面标题</span><span class="badge">一页一意图</span><span class="badge">主题词3-5个</span></div>
      <div class="seo-policy-grid">
        <div><b>网站主题</b><span>所有 AI 内容先围绕站点主营方向，再判断当前页面能承接哪一个具体搜索需求。</span></div>
        <div><b>标题关联</b><span>标题必须准确表达页面主题，并与网站主题保持语义相关；不靠品牌词或关键词机械重复制造相关性。</span></div>
        <div><b>正文展开</b><span>标题确定主意图后，摘要、首段、H2/H3、正文和SEO主题词围绕同一主题展开。</span></div>
        <div><b>质量收口</b><span>最终检查内容量、结构、主题词证据、事实边界、重复度和页面职责，再进入程序化SEO评分。</span></div>
      </div>
      <p style="margin:10px 0;color:var(--muted);font-size:12px;line-height:1.8"><strong>统一组合顺序：</strong>默认写作底线 → 自定义补充规则 → 当前页面资料（网站主题/当前标题/页面资料） → 当前 AI 通道。自定义规则只能补充，不能降低统一SEO/AI质检标准。</p>
      <div style="padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e8edf3;font-size:12px;line-height:1.8"><strong>页面标题生成原则：</strong>先让用户一眼看懂“这是关于什么”，再让搜索引擎获得稳定主题信号；避免“城市+服务+行业+品牌+同义词”全部塞入一个标题。</div>
    </div>
    <div class="ai-prompt-grid">
      ${items.map((item) => {
        const current = valueFor(item.key)
        const spec = AI_PROMPT_SPECS[item.key]
        const check = validateAiPromptVariables(item.key, current || item.defaultPrompt)
        const stats = promptTextStats(current || item.defaultPrompt)
        const saveMark = saved === item.key
        const resetMark = saved === item.key + '-reset'
        return `
        <section class="card ai-prompt-card ${item.key === 'global' ? 'ai-prompt-card-global' : ''}">
          <div class="ai-prompt-heading">
            <div><h3>${escapeHtml(spec.title)}</h3><p>${escapeHtml(spec.description)}</p><p style="margin:4px 0 0;color:var(--muted);font-size:12px">作用：${escapeHtml(spec.purpose)}</p></div>
            <span class="badge">${current ? '已自定义' : '系统默认'}</span>
          </div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin:10px 0;font-size:12px">
            <span class="badge">约 ${stats.chars} 字符</span>
            <span class="badge">约 ${stats.lines} 行</span>
            <span class="badge">输出：${escapeHtml(spec.output)}</span>
            ${check.unknown.length ? `<span class="badge" style="background:#fff1f0;color:#cf1322">未知变量：${escapeHtml(check.unknown.join('、'))}</span>` : '<span class="badge" style="background:#f6ffed;color:#389e0d">变量检查正常</span>'}
          </div>
          ${saveMark || resetMark ? `<p class="ai-prompt-saved">${resetMark ? '已恢复默认。' : '已保存，自下一次生成立即生效。'}</p>` : ''}
          <form class="admin-form" method="post" action="/admin/ai-prompts/save">
            <input type="hidden" name="prompt_key" value="${escapeHtml(item.key)}" />
            <label>自定义补充提示词 <span class="admin-field-hint">留空使用系统默认；填写内容会叠加在系统默认规则之后</span></label>
            <textarea id="aiPrompt_${item.key}" name="prompt" rows="${item.key === 'global' ? 14 : 11}" maxlength="20000" placeholder="教 AI 怎么写：角色、读者、主搜索意图、结构、语气、需要强调的业务场景、禁止事项、质量标准。不要重复整套系统规则。">${escapeHtml(current)}</textarea>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">
              <span style="font-size:12px;color:var(--muted);padding-top:5px">插入变量：</span>
              ${spec.variables.map((v) => `<button type="button" class="btn secondary prompt-var-btn" data-target="aiPrompt_${item.key}" data-value="${escapeHtml(v)}">${escapeHtml(v)}</button>`).join('')}
            </div>
            <div class="ai-prompt-footer">
              <span>允许变量：${spec.variables.map((v) => `<code>${escapeHtml(v)}</code>`).join('、')}</span>
              <div class="admin-actions"><button class="btn" type="submit">保存</button></div>
            </div>
          </form>
          <div class="ai-prompt-coach" style="margin-top:10px;padding:10px 12px;border:1px solid #e8edf3;border-radius:8px;background:#f8fafc;font-size:12px;line-height:1.75"><strong style="display:block;margin-bottom:3px">标题生成教法</strong><span style="color:var(--muted)">${escapeHtml(AI_TITLE_GENERATION_GUIDES[item.key])}</span></div>
          <div class="ai-prompt-coach" style="margin-top:8px;padding:10px 12px;border:1px solid #e8edf3;border-radius:8px;background:#fff;font-size:12px;line-height:1.75"><strong style="display:block;margin-bottom:3px">统一AI质检底线</strong><span style="color:var(--muted)">一页一主题；标题8-45字；最终3-5个主题词且正文有证据；内容要有真实信息、结构和执行/风险说明；不得编造事实或堆关键词。</span></div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
            <form method="post" action="/admin/ai-prompts/test">
              <input type="hidden" name="prompt_key" value="${escapeHtml(item.key)}" />
              <button class="btn secondary" type="submit">🧪 测试当前生效提示词</button>
            </form>
            <form method="post" action="/admin/ai-prompts/reset" class="ai-prompt-reset">
              <input type="hidden" name="prompt_key" value="${escapeHtml(item.key)}" />
              <button class="btn secondary" type="submit" onclick="return confirm('确认恢复系统默认提示词？当前自定义内容会被清空。')">恢复默认</button>
            </form>
          </div>
          <details class="ai-prompt-default">
            <summary>查看系统默认</summary>
            <pre>${escapeHtml(item.defaultPrompt)}</pre>
          </details>
          <details class="ai-prompt-default">
            <summary>查看本任务测试变量</summary>
            <pre>${escapeHtml(JSON.stringify(spec.sampleVariables, null, 2))}</pre>
          </details>
        </section>`
      }).join('')}
    </div>
    <script>
    document.querySelectorAll('.prompt-var-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        const target = document.getElementById(btn.getAttribute('data-target') || '');
        if (!target) return;
        const value = btn.getAttribute('data-value') || '';
        const start = target.selectionStart == null ? target.value.length : target.selectionStart;
        const end = target.selectionEnd == null ? target.value.length : target.selectionEnd;
        target.value = target.value.slice(0, start) + value + target.value.slice(end);
        target.focus();
        const pos = start + value.length;
        target.setSelectionRange(pos, pos);
      });
    });
    </script>
  `,
  })
}

export function renderSettingsPage(settings: Record<string, string>, error = '', saved = false, ai = ''): string {
  const qrUrl = String(settings.contact_qr_url || '').trim()
  const qrPreviewUrl = qrUrl.startsWith('/media/') ? '/wechat-qr?v=20260926-6' : qrUrl
  const siteProfile = getSiteProfile(settings)
  return renderAdminLayout({
    title: '系统设置', active: '/admin/settings',
    body: `
    <div class="section-title"><h2>系统设置</h2></div>
    <p style="color:var(--muted);font-size:13px;margin-top:-8px">全站基础信息、白标站点主题、联系方式与二维码统一管理；二维码删除后立即从 R2 删除。</p>
    <form class="admin-form card admin-settings-card" method="post" action="/admin/settings">
      <h3 style="margin:0 0 6px">🏷️ 白标行业 / 站点画像</h3>
      <p style="margin:0 0 12px;color:var(--muted);font-size:12px;line-height:1.8">复制本仓库到其他行业时，优先修改这里。AI、自动 SEO、首页默认文案和新闻分类会读取这些配置；新站保持白标空状态，行业内容由后台配置。</p>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px">
        <span class="badge">当前主题：${escapeHtml(siteProfile.topic)}</span>
        <span class="badge">行业：${escapeHtml(siteProfile.industry)}</span>
        <span class="badge">模板：${escapeHtml(settings.site_template || 'custom')}</span>
        <span class="badge">服务：${escapeHtml(String(siteProfile.primaryServices.slice(0,5).join('、')))}</span>
      </div>
      <p style="margin:0 0 12px;color:var(--muted);font-size:12px;line-height:1.7">首次部署保持白标空站点。行业名称、服务、行业关键词和新闻分类都由后台输入；不会自动携带其他站点的运营数据。</p>
      <label>网站核心主题</label>
      <input name="site_topic" maxlength="120" value="${escapeHtml(settings.site_topic || '')}" placeholder="例如：本地服务解决方案" />
      <label>网站行业</label>
      <input name="site_industry" maxlength="80" value="${escapeHtml(settings.site_industry || '')}" placeholder="例如：本地服务" />
      <label>核心服务（逗号或换行分隔）</label>
      <textarea name="primary_services" rows="3" maxlength="1000" placeholder="例如：咨询服务,上门服务,项目交付">${escapeHtml(settings.primary_services || '')}</textarea>
      <label>核心主题词（逗号或换行分隔）</label>
      <textarea name="primary_keywords" rows="3" maxlength="1200" placeholder="例如：主题词A,主题词B,主题词C">${escapeHtml(settings.primary_keywords || '')}</textarea>
      <label>行业关键词（自动进入 SEO + 全部 AI 提示词 + 全站内容上下文）</label>
      <textarea name="industry_keywords" rows="4" maxlength="1600" placeholder="例如：服务场景A,目标客户B,行业术语C">${escapeHtml(settings.industry_keywords || '')}</textarea>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:-2px 0 10px">
        <button class="btn secondary" type="submit" formaction="/admin/settings/generate-industry-keywords">🤖 AI生成行业关键词</button>
        <span style="color:var(--muted);font-size:12px;align-self:center">保存或生成后，行业关键词会自动进入 SEO 关键词池与所有 AI 任务提示词。</span>
      </div>
      <label>新闻分类（逗号或换行分隔）</label>
      <textarea name="news_categories" rows="2" maxlength="500" placeholder="例如：行业动态,政策资讯,案例解析,实用指南">${escapeHtml(settings.news_categories || '')}</textarea>
      <button class="btn" type="submit">保存白标画像</button>
    </form>
    ${error ? `<div class="card" style="border-left:4px solid #e5484d;color:#e5484d;margin-bottom:16px">${escapeHtml(error)}</div>` : ''}
    ${saved ? `<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:16px">系统设置已保存。</div>` : ''}
    ${ai ? `<div class="card" style="border-left:4px solid #2563eb;color:#2563eb;margin-bottom:16px">AI已完成“${escapeHtml(ai)}”页面内容生成。</div>` : ''}

    <div class="card admin-settings-card">
      <h3 style="margin:0 0 6px">🤖 AI 内容写作</h3>
      <p style="margin:0 0 12px;color:var(--muted);font-size:13px;line-height:1.8">按页面资料生成清晰的标题、简介和正文，重点保证页面信息完整、结构清楚、手机和电脑端阅读舒适。</p>
      <div class="admin-ai-shortcuts">
        <form method="post" action="/admin/settings/ai-seo"><input type="hidden" name="target" value="site" /><button class="btn secondary" type="submit">AI写站点信息</button></form>
        <form method="post" action="/admin/settings/ai-seo"><input type="hidden" name="target" value="home" /><button class="btn secondary" type="submit">AI写首页</button></form>
        <form method="post" action="/admin/settings/ai-seo"><input type="hidden" name="target" value="services" /><button class="btn secondary" type="submit">AI写服务页</button></form>
        <form method="post" action="/admin/settings/ai-seo"><input type="hidden" name="target" value="cities" /><button class="btn secondary" type="submit">AI写城市页</button></form>
        <form method="post" action="/admin/settings/ai-seo"><input type="hidden" name="target" value="articles" /><button class="btn secondary" type="submit">AI写新闻资讯</button></form>
        <form method="post" action="/admin/settings/ai-seo"><input type="hidden" name="target" value="contact" /><button class="btn secondary" type="submit">AI写联系我们</button></form>
        <form method="post" action="/admin/settings/ai-seo"><input type="hidden" name="target" value="about" /><button class="btn secondary" type="submit">AI写关于我们</button></form>
      </div>
      <p style="margin:12px 0 0"><a class="btn secondary" href="/admin/ai-settings">AI模型与通道设置 →</a></p>
    </div>

    <form class="admin-form" method="post" action="/admin/settings">
      <label>前台站点名称</label>
      <input name="site_name" maxlength="80" value="${escapeHtml(settings.site_name || '')}" placeholder="例如：你的品牌名称" />
      <label>站点标题</label>
      <input name="site_title" value="${escapeHtml(settings.site_title || '')}" />
      <label>站点描述</label>
      <textarea name="site_description" rows="3">${escapeHtml(settings.site_description || '')}</textarea>

      <div class="card admin-settings-card">
        <h3 style="margin:0 0 6px">联系我们页面联系方式</h3>
        <p style="color:var(--muted);font-size:12px;line-height:1.7;margin:0 0 10px">
          联系方式由<a href="/admin/modules" style="color:inherit;text-decoration:underline">「站点模块」→「联系渠道」</a>统一配置；未填写时前台不显示占位联系方式。
        </p>
        <p style="color:var(--warning);font-size:12px;margin:8px 0 0 0">
          ⚠️ 本页面对联系方式的直接编辑已停用。请使用「联系渠道」模块管理电话、微信、QQ 等。
        </p>
      </div>

      <div class="card admin-settings-card" style="margin:12px 0">
        <h3 style="margin:0 0 6px">🔐 搜索引擎通知密钥</h3>
        <p style="color:var(--muted);font-size:12px;line-height:1.8;margin:0 0 10px">这些不是首次部署必填项。保存后密钥加密存储，后台只显示“已配置”，不会回显原文。</p>
        <label>IndexNow Key</label>
        <input name="indexnow_key" type="password" autocomplete="new-password" placeholder="${settings.indexnow_key_configured === '1' ? '已配置，留空保持不变' : '可选：粘贴 IndexNow Key'}" />
        <label style="display:flex;align-items:center;gap:8px;font-size:12px">
          <input type="checkbox" name="clear_indexnow_key" value="on" /> 清除当前 IndexNow Key
        </label>
      </div>
      <label>百度搜索资源平台 Token</label>
      <input name="baidu_token" value="${escapeHtml(settings.baidu_token || '')}" />
      <div class="card admin-settings-card" style="margin:12px 0">
        <h3 style="margin:0 0 6px">📧 留言邮箱回复</h3>
        <p style="color:var(--muted);font-size:12px;line-height:1.7;margin:0 0 10px">可选。配置 Resend API Key 后，后台留言可直接发送邮箱回复；未配置时仍可保存电话、微信、QQ或内部回复记录。首次部署不用在 Cloudflare Secret 里填写。</p>
        <label>发件地址 email_from</label>
        <input type="email" name="email_from" value="${escapeHtml(settings.email_from || '')}" placeholder="例如：noreply@example.com" />
        <label>默认 Reply-To email_reply_to</label>
        <input type="email" name="email_reply_to" value="${escapeHtml(settings.email_reply_to || '')}" placeholder="可留空" />
      </div>
      <div class="card" style="margin:10px 0;padding:12px;background:#f8fbff;border-color:#dbe7f7">
        <strong>360 / 搜狗</strong>
        <p style="color:var(--muted);font-size:12px;line-height:1.7;margin:6px 0 0">白标基础模板不硬编码未经验证的旧推送 API。请在对应站长平台提交本站 <code>/sitemap.xml</code> 或按平台当前官方方式提交 URL。</p>
      </div>
      <div class="card admin-settings-card" style="margin:12px 0">
        <h3 style="margin:0 0 6px">🔑 可选服务密钥状态</h3>
        <p style="color:var(--muted);font-size:12px;line-height:1.8;margin:0 0 8px">Resend：${settings.resend_api_key_configured === '1' ? '已配置' : '未配置'}　·　Google Service Account：${settings.google_service_account_configured === '1' ? '已配置' : '未配置'}</p>
        <p style="color:var(--muted);font-size:12px;line-height:1.8;margin:0">Google Indexing API 不是普通文章批量收录的必需项；普通页面优先使用 Sitemap + Search Console。</p>
      </div>
      <div class="card admin-settings-card" style="margin:12px 0">
        <h3 style="margin:0 0 6px">📄 Footer 页脚</h3>
        <p style="color:var(--muted);font-size:12px;line-height:1.7;margin:0 0 10px">版权、免责声明、AI 内容说明与底部链接由后台配置；留空则使用站点名称与默认免责声明。</p>
        <label>版权文字 footer_copyright</label>
        <input name="footer_copyright" maxlength="200" value="${escapeHtml(settings.footer_copyright || '')}" placeholder="例如：© 2026 网站名称" />
        <label>免责声明 footer_disclaimer</label>
        <textarea name="footer_disclaimer" rows="2" maxlength="500" placeholder="例如：本站内容仅供参考">${escapeHtml(settings.footer_disclaimer || '')}</textarea>
        <label>AI 内容声明 footer_ai_notice</label>
        <textarea name="footer_ai_notice" rows="2" maxlength="500" placeholder="可选。例如：部分内容可能经 AI 辅助整理，发布前已人工审核">${escapeHtml(settings.footer_ai_notice || '')}</textarea>
        <div class="card" style="margin-top:16px">
      <h3 style="margin-top:0">可选服务密钥（后台设置）</h3>
      <p style="color:var(--muted);font-size:12px;line-height:1.8">首次 Cloudflare 部署不需要填写这些。保存后密钥会加密存储，后台只显示“已配置”，不会回显原文。</p>
      <label>Resend API Key（邮件回复）</label>
      <input name="resend_api_key" type="password" autocomplete="new-password" placeholder="留空保持不变" />
      <label>Google Service Account JSON（可选收录 API）</label>
      <textarea name="google_service_account_json" rows="4" autocomplete="off" placeholder="粘贴完整 JSON；留空保持不变"></textarea>
    </div><label>底部链接 footer_links（每行：标签|路径或https地址）</label>
        <textarea name="footer_links" rows="3" maxlength="1500" placeholder="关于我们|/about\n联系我们|/contact">${escapeHtml(settings.footer_links || '')}</textarea>
      </div>
      <button class="btn" type="submit">保存设置</button>
    </form>

    <div class="card admin-settings-card">
      <h3 style="margin:0 0 8px">微信二维码管理</h3>
      <p style="color:var(--muted);font-size:12px;line-height:1.7">二维码独立于“保存设置”表单。上传会替换旧文件；删除会同时删除 R2 文件和配置，不保留副本。</p>
      ${qrUrl ? `
        <div style="display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;margin-top:12px">
          <div>
            <div class="contact-qr-admin"><img src="${escapeHtml(qrPreviewUrl)}" alt="当前微信二维码" loading="eager" decoding="sync" width="180" height="180" /></div>
            <div style="margin-top:8px;color:var(--muted);font-size:12px">当前已上传二维码</div>
          </div>
          <form method="post" action="/admin/settings/contact-qr/delete">
            <button class="btn secondary" type="submit" onclick="return confirm('确认永久删除当前微信二维码？R2 文件和配置会立即删除，删除后不可恢复。')">删除微信二维码</button>
          </form>
        </div>` : `
        <div style="margin:12px 0;color:var(--muted);font-size:13px">当前没有微信二维码。</div>
      `}
      <form class="admin-form" method="post" action="/admin/settings/contact-qr" enctype="multipart/form-data" style="margin-top:14px">
        <input type="file" name="file" accept="image/jpeg,image/png,image/webp" required />
        <button class="btn" type="submit">上传并替换微信二维码</button>
      </form>
    </div>
  `,
  })
}

export function renderSubprojectsList(rows: any[], message = ''): string {
  const sectionLabels: Record<string, string> = { service: '服务', article: '资讯', new: '新闻专题', city: '城市' }
  return renderAdminLayout({
    title: '子项目管理',
    active: '/admin/subprojects',
    body: `
    <div class="section-title">
      <div><h2>子项目 / 栏目标签</h2><p style="margin:4px 0 0;color:var(--muted);font-size:13px">为 /service、/article、/new、/city 分别创建独立的子项目页面。每个子项目都有独立 Slug、标签、SEO、布局和内容绑定。</p></div>
      <a class="btn" href="/admin/subprojects/new">＋ 添加子项目</a>
    </div>
    ${message ? '<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:16px">' + escapeHtml(message) + '</div>' : ''}
    <div class="admin-table-wrap">
      <table>
        <thead><tr><th>栏目</th><th>标签</th><th>URL Slug</th><th>布局</th><th>状态</th><th>绑定内容</th><th>操作</th></tr></thead>
        <tbody>
        ${rows.length ? rows.map((row) => `<tr>
          <td>${escapeHtml(sectionLabels[String(row.section)] || row.section)}</td>
          <td><strong>${escapeHtml(row.label_zh || row.name)}</strong>${row.label_en ? ' / ' + escapeHtml(row.label_en) : ''}</td>
          <td><code>${escapeHtml(row.slug)}</code></td>
          <td>${escapeHtml(row.layout === 'list' ? '列表' : row.layout === 'feature' ? '重点' : '卡片网格')}</td>
          <td>${row.is_active ? '启用' : '停用'}</td>
          <td>${Number(row.item_count || 0)} 项</td>
          <td><a href="/admin/subprojects/${row.id}/edit">编辑</a> &nbsp; <form method="post" action="/admin/subprojects/${row.id}" style="display:inline" onsubmit="return confirm('确认删除这个子项目？关联内容不会删除，只删除子项目标签和绑定关系。')"><button class="btn secondary" style="padding:2px 10px;color:#e5484d" type="submit">删除</button></form></td>
        </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">暂无子项目</td></tr>'}
        </tbody>
      </table>
    </div>
  `,
  })
}

export function renderSubprojectForm(opts: {
  subproject?: any
  items?: any[]
  selectedIds?: number[]
  error?: string
  saved?: boolean
}): string {
  const p = opts.subproject || {
    section: 'service', name: '', slug: '', label_zh: '', label_en: '',
    title_zh: '', title_en: '', subtitle_zh: '', subtitle_en: '',
    content_zh: '', content_en: '', seo_title_zh: '', seo_title_en: '',
    seo_description_zh: '', seo_description_en: '', seo_keywords_zh: '', seo_keywords_en: '',
    layout: 'grid', is_active: 1, sort_order: 0,
  }
  const selected = new Set((opts.selectedIds || []).map((id) => Number(id)))
  const groups: Record<string, string> = { service: '服务', article: '资讯文章', new: '新闻文章', city: '城市' }
  const itemLabel = String(p.section) === 'service' ? '选择服务项目' : String(p.section) === 'city' ? '选择城市' : '选择文章'
  return renderAdminLayout({
    title: opts.subproject ? '编辑子项目' : '新建子项目',
    active: '/admin/subprojects',
    body: `
    <div class="section-title"><h2>${opts.subproject ? '编辑子项目' : '新建子项目'}</h2><a href="/admin/subprojects">← 返回子项目列表</a></div>
    ${opts.error ? '<div class="card" style="border-left:4px solid #e5484d;color:#c92a2a;margin-bottom:16px">' + escapeHtml(opts.error) + '</div>' : ''}
    ${opts.saved ? '<div class="card" style="border-left:4px solid #1a8a4e;color:#1a8a4e;margin-bottom:16px">子项目已保存。</div>' : ''}
    <form class="admin-form" method="post" action="${opts.subproject ? '/admin/subprojects/' + opts.subproject.id + '/edit' : '/admin/subprojects/new'}">
      <label>所属栏目</label>
      <select name="section" ${opts.subproject ? 'disabled' : ''}>
        ${Object.entries(groups).map(([key, label]) => '<option value="' + key + '" ' + (String(p.section) === key ? 'selected' : '') + '>' + label + '</option>').join('')}
      </select>
      ${opts.subproject ? '<input type="hidden" name="section" value="' + escapeHtml(p.section) + '" />' : ''}
      <label>后台名称</label>
      <input name="name" value="${escapeHtml(p.name || '')}" maxlength="120" required placeholder="例如：项目服务" />
      <label>中文标签</label>
      <input name="label_zh" value="${escapeHtml(p.label_zh || p.name || '')}" maxlength="120" required placeholder="前台标签文字" />
      <label>English label</label>
      <input name="label_en" value="${escapeHtml(p.label_en || '')}" maxlength="120" placeholder="Optional" />
      <label>URL Slug <span class="admin-field-hint">只能使用小写字母、数字和短横线</span></label>
      <input name="slug" value="${escapeHtml(p.slug || '')}" maxlength="120" pattern="[a-z0-9-]+" required placeholder="例如 service-slug" />
      <div class="card" style="margin:12px 0">
        <strong>前台页面路径</strong>
        <p style="margin:6px 0;color:var(--muted);font-size:12px">服务：/service/topic/slug　资讯：/article/tag/slug　新闻专题：/new/slug　城市：/city/topic/slug</p>
      </div>
      <label>中文标题</label><input name="title_zh" value="${escapeHtml(p.title_zh || '')}" maxlength="180" placeholder="留空自动使用中文标签" />
      <label>English title</label><input name="title_en" value="${escapeHtml(p.title_en || '')}" maxlength="180" />
      <label>中文副标题</label><input name="subtitle_zh" value="${escapeHtml(p.subtitle_zh || '')}" maxlength="300" />
      <label>English subtitle</label><input name="subtitle_en" value="${escapeHtml(p.subtitle_en || '')}" maxlength="300" />
      <label>中文正文 / 页面说明</label><textarea name="content_zh" rows="9" maxlength="16000">${escapeHtml(p.content_zh || '')}</textarea>
      <label>English content</label><textarea name="content_en" rows="9" maxlength="16000">${escapeHtml(p.content_en || '')}</textarea>
      <label>中文 SEO 标题</label><input name="seo_title_zh" value="${escapeHtml(p.seo_title_zh || '')}" maxlength="180" />
      <label>English SEO title</label><input name="seo_title_en" value="${escapeHtml(p.seo_title_en || '')}" maxlength="180" />
      <label>中文 SEO 描述</label><textarea name="seo_description_zh" rows="3" maxlength="320">${escapeHtml(p.seo_description_zh || '')}</textarea>
      <label>English SEO description</label><textarea name="seo_description_en" rows="3" maxlength="320">${escapeHtml(p.seo_description_en || '')}</textarea>
      <label>中文 SEO 主题词（3-5个，逗号分隔）</label><input name="seo_keywords_zh" value="${escapeHtml(p.seo_keywords_zh || '')}" maxlength="300" />
      <label>English SEO topics</label><input name="seo_keywords_en" value="${escapeHtml(p.seo_keywords_en || '')}" maxlength="300" />
      <label>页面布局</label>
      <select name="layout">
        <option value="grid" ${p.layout === 'grid' ? 'selected' : ''}>卡片网格</option>
        <option value="list" ${p.layout === 'list' ? 'selected' : ''}>列表</option>
        <option value="feature" ${p.layout === 'feature' ? 'selected' : ''}>重点卡片</option>
      </select>
      <label>排序</label><input type="number" name="sort_order" value="${escapeHtml(p.sort_order ?? 0)}" min="0" max="9999" />
      <label><input type="checkbox" name="is_active" value="1" ${p.is_active ? 'checked' : ''} /> 前台启用</label>

      <div class="card" style="margin-top:16px">
        <h3 style="margin-top:0">${escapeHtml(itemLabel)}</h3>
        <p style="color:var(--muted);font-size:12px">子项目页面只显示这里选中的内容；取消勾选只会解除绑定，不会删除原内容。</p>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px;max-height:480px;overflow:auto">
          ${(opts.items || []).map((item) => `
            <label style="display:flex;gap:8px;align-items:flex-start;padding:8px;border:1px solid #e8edf3;border-radius:8px;background:#fff">
              <input type="checkbox" name="item_ids" value="${escapeHtml(item.id)}" ${selected.has(Number(item.id)) ? 'checked' : ''} />
              <span><strong>${escapeHtml(item.name || item.title || '')}</strong>${item.slug ? '<br><small style="color:var(--muted)">' + escapeHtml(item.slug) + '</small>' : ''}</span>
            </label>`).join('') || '<p style="color:var(--muted)">暂无可绑定内容，请先在对应模块添加。</p>'}
        </div>
      </div>

      <button class="btn" type="submit">保存子项目</button>
    </form>
  `,
  })
}
