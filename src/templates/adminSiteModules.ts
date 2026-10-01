import { escapeHtml } from './layout'
import { renderAdminLayout } from './admin'
import type { ContactChannel } from '../modules/contactChannels'
import type { NavigationItem } from '../modules/navigation/service'
import type { LanguageOption } from '../modules/languageManager'

const CHANNEL_TYPES = ['phone', 'wechat', 'qq', 'email', 'whatsapp', 'telegram', 'address', 'custom'] as const

export function renderSiteModulesPage(opts: {
  contacts: ContactChannel[]
  navigation: NavigationItem[]
  languages: LanguageOption[]
  message?: string
  error?: string
}): string {
  const { contacts, navigation, message = '', error = '' } = opts
  void opts.languages

  const contactRows = contacts.length
    ? contacts.map((c, i) => `
      <tr data-idx="${i}">
        <td><input name="c_id_${i}" value="${escapeHtml(c.id)}" readonly style="width:72px;font-size:12px" /></td>
        <td><select name="c_type_${i}">${CHANNEL_TYPES.map((t) => `<option value="${t}"${c.type === t ? ' selected' : ''}>${t}</option>`).join('')}</select></td>
        <td><input name="c_label_${i}" value="${escapeHtml(c.label)}" /></td>
        <td><input name="c_value_${i}" value="${escapeHtml(c.value)}" style="min-width:160px" /></td>
        <td><input name="c_open_${i}" value="${escapeHtml(c.openUrl || '')}" placeholder="打开链接（可选）" style="min-width:180px" /></td>
        <td>
          <input name="c_qr_${i}" value="${escapeHtml(c.qrUrl || '')}" placeholder="R2二维码URL（可选）" style="min-width:180px" />
          <input type="file" name="c_qr_file_${i}" accept="image/jpeg,image/png,image/webp,image/gif" style="max-width:220px;margin-top:4px" />
        </td>
        <td><input name="c_locale_${i}" value="${escapeHtml(c.locale || 'all')}" style="width:72px" /></td>
        <td><input type="number" name="c_sort_${i}" value="${Number(c.sortOrder) || i + 1}" style="width:62px" /></td>
        <td style="text-align:center"><input type="checkbox" name="c_enabled_${i}" value="1"${c.enabled !== false ? ' checked' : ''} /></td>
        <td style="font-size:12px;line-height:1.8">
          <label><input type="checkbox" name="c_header_${i}" value="1"${c.display?.header ? ' checked' : ''} /> Header</label><br>
          <label><input type="checkbox" name="c_footer_${i}" value="1"${c.display?.footer !== false ? ' checked' : ''} /> Footer</label><br>
          <label><input type="checkbox" name="c_contact_${i}" value="1"${c.display?.contact !== false ? ' checked' : ''} /> 联系页</label><br>
          <label><input type="checkbox" name="c_ai_${i}" value="1"${c.display?.ai !== false ? ' checked' : ''} /> AI</label>
        </td>
        <td><button type="button" class="btn secondary btn-sm" onclick="removeRow(this)">删除</button></td>
      </tr>`).join('')
    : ''

  const navRows = navigation.map((n, i) => `
      <tr data-idx="${i}">
        <td><input name="n_key_${i}" value="${escapeHtml(n.key)}" readonly style="width:90px" /></td>
        <td><input name="n_path_${i}" value="${escapeHtml(n.path)}" readonly style="width:100px" /></td>
        <td><input name="n_label_${i}" value="${escapeHtml(n.label)}" /></td>
        <td><input type="number" name="n_sort_${i}" value="${Number(n.sortOrder) || i + 1}" style="width:72px" /></td>
        <td><input type="number" name="n_mobile_${i}" value="${Number(n.mobileOrder) || i + 1}" style="width:72px" /></td>
        <td style="text-align:center"><input type="checkbox" name="n_enabled_${i}" value="1"${n.enabled !== false ? ' checked' : ''} /></td>
      </tr>`).join('')

  return renderAdminLayout({
    title: '站点模块',
    active: '/admin/modules',
    body: `
    <div class="section-title">
      <div>
        <h2>站点模块</h2>
        <p style="margin:4px 0 0;color:var(--muted);font-size:13px">统一管理前台导航顺序与联系渠道。路径固定不可改；标签名也可在「页面管理」中修改。</p>
      </div>
    </div>
    ${message ? `<div class="card" style="border-left:4px solid #2f9e44;margin-bottom:16px">${escapeHtml(message)}</div>` : ''}
    ${error ? `<div class="card" style="border-left:4px solid #e5484d;color:#c92a2a;margin-bottom:16px">${escapeHtml(error)}</div>` : ''}

    <div class="card" style="margin-bottom:20px">
      <h3 style="margin-top:0">① 联系渠道</h3>
      <p style="color:var(--muted);font-size:13px;margin-top:0">联系方式渠道：支持电话、即时通讯、邮箱、二维码、自定义链接等多种类型。可配置打开链接、二维码与不同展示场景（Header / Footer / 联系页 / AI）；选择二维码文件后保存，系统会上传到 R2 并写入媒体地址。</p>
      <form method="post" action="/admin/modules/contact/form" id="contactForm" enctype="multipart/form-data">
        <input type="hidden" name="contact_count" id="contact_count" value="${contacts.length}" />
        <div class="admin-table-wrap">
          <table id="contactTable">
            <thead><tr><th>ID</th><th>类型</th><th>标签</th><th>值</th><th>打开链接</th><th>二维码</th><th>语言</th><th>排序</th><th>启用</th><th>显示位置</th><th></th></tr></thead>
            <tbody>${contactRows}</tbody>
          </table>
        </div>
        <div style="display:flex;gap:10px;margin-top:12px;flex-wrap:wrap">
          <button type="button" class="btn secondary" onclick="addContactRow()">+ 添加渠道</button>
          <button type="submit" class="btn">保存联系方式</button>
        </div>
      </form>
    </div>

    <div class="card" style="margin-bottom:20px">
      <h3 style="margin-top:0">② 导航顺序与启停</h3>
      <p style="color:var(--muted);font-size:13px;margin-top:0">路径固定。桌面顺序用 sortOrder，底部导航用 mobileOrder。标签可在此改，也可在页面管理改。</p>
      <form method="post" action="/admin/modules/navigation/form">
        <input type="hidden" name="nav_count" value="${navigation.length}" />
        <div class="admin-table-wrap"><table><thead><tr><th>Key</th><th>路径</th><th>标签</th><th>桌面顺序</th><th>移动顺序</th><th>启用</th></tr></thead><tbody>${navRows}</tbody></table></div>
        <button type="submit" class="btn" style="margin-top:12px">保存导航</button>
      </form>
    </div>

    <div class="card">
      <h3 style="margin-top:0">③ 语言</h3>
      <p style="color:var(--muted);font-size:13px;margin-top:0">本站点<strong>仅中文</strong>。English 已移除，页头不再显示语言切换。</p>
      <div class="card" style="padding:12px;background:var(--surface, #f6f7f9)">中文（zh-CN）· 已启用 · 默认语言</div>
    </div>

    <script>
    function removeRow(btn){var tr=btn.closest('tr');if(tr)tr.remove();reindexContacts();}
    function reindexContacts(){var rows=document.querySelectorAll('#contactTable tbody tr');document.getElementById('contact_count').value=rows.length;rows.forEach(function(tr,i){tr.setAttribute('data-idx',i);tr.querySelectorAll('input,select').forEach(function(el){if(!el.name)return;el.name=el.name.replace(/_\\d+$/,'_'+i);});});}
    function addContactRow(){
      var tbody=document.querySelector('#contactTable tbody');var i=tbody.querySelectorAll('tr').length;var id=String(Date.now())+'-'+i;var tr=document.createElement('tr');tr.setAttribute('data-idx',i);
      tr.innerHTML='<td><input name="c_id_'+i+'" value="'+id+'" readonly style="width:72px;font-size:12px" /></td>'+
        '<td><select name="c_type_'+i+'">'+${JSON.stringify([...CHANNEL_TYPES])}.map(function(t){return '<option value="'+t+'">'+t+'</option>';}).join('')+'</select></td>'+
        '<td><input name="c_label_'+i+'" value="" /></td><td><input name="c_value_'+i+'" value="" style="min-width:160px" /></td>'+
        '<td><input name="c_open_'+i+'" value="" placeholder="https://..." style="min-width:180px" /></td><td><input name="c_qr_'+i+'" value="" placeholder="R2二维码URL" style="min-width:180px" /><input type="file" name="c_qr_file_'+i+'" accept="image/jpeg,image/png,image/webp,image/gif" style="max-width:220px;margin-top:4px" /></td>'+
        '<td><input name="c_locale_'+i+'" value="all" style="width:72px" /></td><td><input type="number" name="c_sort_'+i+'" value="'+(i+1)+'" style="width:62px" /></td>'+
        '<td style="text-align:center"><input type="checkbox" name="c_enabled_'+i+'" value="1" checked /></td>'+
        '<td style="font-size:12px;line-height:1.8"><label><input type="checkbox" name="c_header_'+i+'" value="1" /> Header</label><br><label><input type="checkbox" name="c_footer_'+i+'" value="1" checked /> Footer</label><br><label><input type="checkbox" name="c_contact_'+i+'" value="1" checked /> 联系页</label><br><label><input type="checkbox" name="c_ai_'+i+'" value="1" checked /> AI</label></td>'+
        '<td><button type="button" class="btn secondary btn-sm" onclick="removeRow(this)">删除</button></td>';
      tbody.appendChild(tr);document.getElementById('contact_count').value=i+1;
    }
    </script>
  `,
  })
}
