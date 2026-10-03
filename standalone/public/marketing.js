(function () {
  'use strict';

  const LANGUAGES = { zh: '中文', ms: 'Bahasa Melayu', en: 'English' };
  const SOURCES = { website: '网站', social: '社交渠道', telegram: 'Telegram' };
  const COPY = {
    zh: {
      intro: '查看平台介绍、账户使用说明和客服入口。具体内容以平台公布的资料为准。',
      account: '需要账户使用帮助？请通过平台的官方客服入口咨询。',
      support: '客服可协助处理使用问题。请勿发送密码、验证码或银行资料。'
    },
    ms: {
      intro: 'Lihat pengenalan platform, panduan akaun dan pusat bantuan. Rujuk maklumat rasmi platform.',
      account: 'Perlukan bantuan akaun? Hubungi sokongan melalui saluran rasmi platform.',
      support: 'Sokongan sedia membantu. Jangan kongsi kata laluan, OTP atau maklumat bank.'
    },
    en: {
      intro: 'Explore the platform, account guides and support centre. Refer to the platform’s official information.',
      account: 'Need account help? Contact support through the platform’s official support channel.',
      support: 'Support can help with platform questions. Never share passwords, OTPs or bank details.'
    }
  };

  function create() {
    return { campaigns: [], optins: [], nextCampaign: 1, nextAlias: 1 };
  }

  function state(tenant) {
    if (!tenant || typeof tenant !== 'object') return null;
    if (!tenant.marketing || !Array.isArray(tenant.marketing.campaigns) || !Array.isArray(tenant.marketing.optins)) {
      tenant.marketing = create();
    }
    return tenant.marketing;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function button(label, action, id, className) {
    return '<button type="button" class="cursor-interaction ' + esc(className || '') + '" data-action="' + esc(action) + '"' + (id ? ' data-id="' + esc(id) + '"' : '') + '>' + esc(label) + '</button>';
  }

  function trackingUrl(tenant, campaign) {
    const raw = String(tenant.domain || '').trim().toLowerCase();
    if (raw.length > 253 || !/^[a-z0-9.-]+$/.test(raw) || !raw.includes('.')) return '';
    const labels = raw.split('.');
    if (labels.some(function (part) { return !part || part.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part); })) return '';
    if (!/^[a-z][a-z0-9-]*$/.test(labels[labels.length - 1])) return '';
    try {
      const url = new URL('https://' + raw + '/');
      if (url.hostname !== raw || url.username || url.password || url.port || url.protocol !== 'https:') return '';
      url.search = new URLSearchParams({ utm_source: campaign.source, utm_medium: 'draft', utm_campaign: campaign.id, utm_content: campaign.language }).toString();
      return url.toString();
    } catch (_) {
      return '';
    }
  }

  function renderCampaign(tenant, campaign) {
    const copy = COPY[campaign.language];
    const url = trackingUrl(tenant, campaign);
    const rate = campaign.clicks ? Math.round(campaign.registrations / campaign.clicks * 100) : 0;
    return '<article class="panel gap"><div class="row"><h3 style="overflow-wrap:anywhere">' + esc(campaign.title) + '</h3><span class="badge">文案草稿 · 未发布</span></div>' +
      '<p class="small">' + esc(LANGUAGES[campaign.language]) + ' · ' + esc(SOURCES[campaign.source]) + '</p>' +
      '<label>介绍文案<textarea readonly rows="3" style="width:100%;box-sizing:border-box;font:inherit;border:1px solid #cbdbe8;border-radius:9px;padding:12px;background:#f0f8fd;color:#16304d">' + esc(campaign.content || copy.intro) + '</textarea></label>' +
      '<div class="formgrid gap"><div><strong>账户帮助</strong><p style="overflow-wrap:anywhere">' + esc(copy.account) + '</p></div><div><strong>客服提示</strong><p style="overflow-wrap:anywhere">' + esc(copy.support) + '</p></div></div>' +
      '<div class="note">素材草稿：白、浅蓝与金色；清楚展示介绍和客服入口。尚未生成图片或提交广告审核。</div>' +
      (url ? '<label class="gap">追踪网址样稿（域名未绑定；不会产生实际统计）<input readonly value="' + esc(url) + '" aria-label="追踪网址样稿"></label>' : '<div class="note">网址格式无效，暂不生成追踪网址样稿。</div>') +
      '<div class="grid gap"><div><span class="small">模拟点击</span><strong class="stat">' + campaign.clicks + '</strong></div><div><span class="small">模拟注册</span><strong class="stat">' + campaign.registrations + '</strong></div><div><span class="small">模拟点击转注册率</span><strong class="stat">' + rate + '%</strong></div></div>' +
      '<div class="tools">' + button('模拟一次点击', 'mk-click', campaign.id, 'gold') + button('模拟一次注册', 'mk-register', campaign.id) + '</div></article>';
  }

  function render(tenant) {
    const data = state(tenant);
    if (!data) return '<section class="panel"><p>无法读取当前演示客户。</p></section>';
    const totalClicks = data.campaigns.reduce(function (sum, c) { return sum + c.clicks; }, 0);
    const totalRegistrations = data.campaigns.reduce(function (sum, c) { return sum + c.registrations; }, 0);
    const optedIn = data.optins.filter(function (p) { return p.active; }).length;
    return '<section class="panel"><div class="row"><h3>推广中心</h3><span class="badge">演示 · 未连接</span></div>' +
      '<p class="small">整理文案、素材说明和渠道追踪样稿。草稿保存在独立后台，不发送通知、不投放广告，也不带来真实访问。</p>' +
      '<div class="grid"><div><span class="small">文案草稿</span><strong class="stat">' + data.campaigns.length + '</strong></div><div><span class="small">模拟点击总计</span><strong class="stat">' + totalClicks + '</strong></div><div><span class="small">模拟注册总计</span><strong class="stat">' + totalRegistrations + '</strong></div></div>' +
      '<h3 class="gap">创建文案草稿</h3><form id="mk-campaign-form"><div class="formgrid"><label>草稿名称<input name="title" required maxlength="60" placeholder="例如：平台介绍"></label>' +
      '<label>语言<select name="language">' + Object.keys(LANGUAGES).map(function (key) { return '<option value="' + key + '">' + esc(LANGUAGES[key]) + '</option>'; }).join('') + '</select></label>' +
      '<label>来源渠道<select name="source">' + Object.keys(SOURCES).map(function (key) { return '<option value="' + key + '">' + esc(SOURCES[key]) + '</option>'; }).join('') + '</select></label>' +
      '<label>介绍文案（可留空）<textarea name="content" maxlength="500" rows="3" placeholder="产品介绍、账户帮助或客服信息；留空使用中性样稿。" style="width:100%;box-sizing:border-box;font:inherit;border:1px solid #cbdbe8;border-radius:9px;padding:12px;background:#f0f8fd;color:#16304d"></textarea></label></div>' +
      '<p class="small gap">草稿尚未发布；内容与广告资格须按实际渠道核对。最多保留 40 份演示草稿。</p><button type="submit" class="primary cursor-interaction">建立草稿</button></form></section>' +
      (data.campaigns.length ? data.campaigns.map(function (c) { return renderCampaign(tenant, c); }).join('') : '<section class="panel gap"><h3>文案与素材</h3><p class="small">还没有草稿。建立后可查看中、马或英文介绍及模拟来源报表。</p></section>') +
      '<section class="panel gap"><div class="row"><h3>订阅同意流程</h3>' + button('新增虚构同意记录', 'mk-optin-add', '', 'gold') + '</div><p class="small">有效同意示例：' + optedIn + '。这里只使用虚构代号，不填写真实电话或邮箱。最多保留 40 条示例。</p>' +
      '<div class="scroll"><table><thead><tr><th>虚构代号</th><th>同意状态</th><th>通知</th><th>操作</th></tr></thead><tbody>' +
      (data.optins.length ? data.optins.map(function (p) { return '<tr><td>' + esc(p.alias) + '</td><td>' + (p.active ? '模拟已同意' : '模拟已退订') + '</td><td>未发送</td><td>' + (p.active ? button('模拟退订', 'mk-optin-revoke', p.id) : '已停止订阅') + '</td></tr>'; }).join('') : '<tr><td colspan="4">暂无同意记录；不会自动加入订阅者。</td></tr>') + '</tbody></table></div></section>' +
      '<section class="panel gap"><h3>渠道连接状态</h3><div class="planrow"><span>付费广告渠道</span><span>未连接 · 未投放</span></div><div class="planrow"><span>Telegram 通知</span><span>未连接 · 未发送</span></div><div class="planrow"><span>邮件 / 手机通知</span><span>未连接 · 未发送</span></div><div class="planrow"><span>真实访问与注册数据</span><span>未接入</span></div><p class="small gap">每个客户的草稿和演示记录独立；复制模板不带走这些记录。配置会在重新打开后保留。</p></section>';
  }

  function field(formData, name) {
    const value = formData && typeof formData.get === 'function' ? formData.get(name) : null;
    return typeof value === 'string' ? value.trim() : '';
  }

  function submit(tenant, formData) {
    const data = state(tenant);
    if (!data) return { notice: '无法读取当前演示客户。' };
    const title = field(formData, 'title');
    const language = field(formData, 'language');
    const source = field(formData, 'source');
    const content = field(formData, 'content');
    if (!title || title.length > 60) return { notice: '请填写 1 至 60 字的草稿名称。' };
    if (!Object.prototype.hasOwnProperty.call(LANGUAGES, language) || !Object.prototype.hasOwnProperty.call(SOURCES, source)) return { notice: '请选择有效的语言和来源渠道。' };
    if (content.length > 500) return { notice: '介绍文案请控制在 500 字以内。' };
    if (data.campaigns.length >= 40) return { notice: '已达到 40 份演示草稿的上限。' };
    const id = 'mkc-' + data.nextCampaign++;
    data.campaigns.push({ id: id, title: title, language: language, source: source, content: content, clicks: 0, registrations: 0 });
    return { notice: '文案草稿已建立；尚未发布，也没有发送或投放广告。' };
  }

  function click(tenant, action, id) {
    const data = state(tenant);
    if (!data) return { notice: '无法读取当前演示客户。' };
    if (action === 'mk-optin-add') {
      if (id) return { notice: '无效的演示操作。' };
      if (data.optins.length >= 40) return { notice: '已达到 40 条同意示例的上限。' };
      const n = data.nextAlias++;
      data.optins.push({ id: 'mko-' + n, alias: '示例订阅者 ' + String(n).padStart(3, '0'), active: true });
      return { notice: '新增一条虚构同意记录；没有真实订阅者，也没有发送通知。' };
    }
    if (action === 'mk-optin-revoke') {
      if (typeof id !== 'string' || !/^mko-[1-9]\d{0,7}$/.test(id)) return { notice: '无效的订阅记录。' };
      const person = data.optins.find(function (p) { return p.id === id; });
      if (!person) return { notice: '未找到当前客户的订阅记录。' };
      if (!person.active) return { notice: '这个虚构订阅者已经退订。' };
      person.active = false;
      return { notice: '已模拟退订；这个虚构代号不再列入有效同意记录。' };
    }
    if (action !== 'mk-click' && action !== 'mk-register') return { notice: '无效的演示操作。' };
    if (typeof id !== 'string' || !/^mkc-[1-9]\d{0,7}$/.test(id)) return { notice: '无效的文案草稿。' };
    const campaign = data.campaigns.find(function (c) { return c.id === id; });
    if (!campaign) return { notice: '未找到当前客户的文案草稿。' };
    if (action === 'mk-click') {
      if (campaign.clicks >= 999999) return { notice: '已达到模拟点击上限。' };
      campaign.clicks++;
      return { notice: '记录了一次模拟点击；没有实际访问或网络请求。' };
    }
    if (campaign.registrations >= campaign.clicks) return { notice: '请先模拟一次点击，再模拟对应的注册。' };
    campaign.registrations++;
    return { notice: '记录了一次模拟注册；没有创建真实会员或发送通知。' };
  }

  window.RentalMarketing = { create: create, render: render, submit: submit, click: click };
})();
