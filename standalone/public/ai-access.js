(function () {
  'use strict';

  const MODES = { assistant: '授权后台协助', support: '平台 AI 客服' };
  const PURPOSES = [
    { key: 'includeFAQ', label: 'FAQ', detail: '根据客户提供的常见问题资料生成回答。' },
    { key: 'includeDrafts', label: '推广草稿', detail: '准备介绍文案，由客户审核后自行发布。' },
    { key: 'includeReports', label: '只读示例报表', detail: '演示查看虚构统计数据，不读取真实账户资料。' }
  ];

  function create() {
    return { prepared: false, mode: 'assistant', includeFAQ: true, includeDrafts: true, includeReports: false };
  }

  function state(tenant) {
    if (!tenant || typeof tenant !== 'object') return null;
    const value = tenant.aiAccess;
    if (!value || typeof value !== 'object' ||
        !Object.prototype.hasOwnProperty.call(MODES, value.mode) ||
        typeof value.prepared !== 'boolean' ||
        PURPOSES.some(function (purpose) { return typeof value[purpose.key] !== 'boolean'; })) {
      tenant.aiAccess = create();
    }
    return tenant.aiAccess;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function scopeLabels(plan) {
    return PURPOSES.filter(function (purpose) { return plan[purpose.key]; }).map(function (purpose) { return purpose.label; });
  }

  function render(tenant) {
    const plan = state(tenant);
    if (!plan) return '<section class="panel"><p>无法读取当前演示客户。</p></section>';
    const options = Object.keys(MODES).map(function (mode) {
      return '<option value="' + esc(mode) + '"' + (plan.mode === mode ? ' selected' : '') + '>' + esc(MODES[mode]) + '</option>';
    }).join('');
    const purposes = PURPOSES.map(function (purpose) {
      return '<label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" name="' + esc(purpose.key) + '" value="yes"' + (plan[purpose.key] ? ' checked' : '') + ' style="width:auto;margin-top:4px"><span>' + esc(purpose.label) + '<span class="small" style="display:block">' + esc(purpose.detail) + '</span></span></label>';
    }).join('');
    const draft = plan.prepared ?
      '<section class="panel gap"><div class="row"><h3>接入计划草稿</h3><span class="badge">草稿已保存</span></div>' +
      '<div class="planrow"><span>客户</span><span style="overflow-wrap:anywhere">' + esc(tenant.name || '当前客户') + '</span></div>' +
      '<div class="planrow"><span>拟接入方式</span><span>' + esc(MODES[plan.mode]) + '</span></div>' +
      '<div class="planrow"><span>拟用途</span><span>' + esc(scopeLabels(plan).join('、')) + '</span></div>' +
      '<div class="planrow"><span>连接状态</span><strong>尚未连接</strong></div>' +
      '<p class="small gap">拟范围限于资料问答、创建文案草稿和只读示例数据。这份计划没有实施AI 运行时授权或权限控制。</p>' +
      '<div class="tools"><button type="button" class="cursor-interaction" data-action="ai-plan-revoke">撤回计划</button></div></section>' :
      '<section class="panel gap"><h3>接入计划草稿</h3><p class="small">尚未建立。选择用途后可生成一份供客户研究的草稿。</p></section>';
    return '<section class="panel"><div class="row"><h3>客户 AI 接入</h3><span class="badge">尚未连接</span></div>' +
      '<p>客户以后可为自己的平台单独授权 AI 接入，平台继续使用客户自己的品牌。</p>' +
      '<div class="note">目前只能准备接入计划草稿，没有实际 OAuth 授权、MCP 连接或模型请求。</div>' +
      '<form id="ai-plan-form" class="gap"><div class="formgrid"><label>拟接入方式<select name="mode">' + options + '</select></label>' +
      '<div><strong>两种方式</strong><p class="small">授权后台协助：客户的 AI 经客户许可后协助查看资料、准备草稿。平台 AI 客服：在平台内提供资料问答。</p></div></div>' +
      '<p class="gap"><strong>拟用途</strong></p><div class="formgrid">' + purposes + '</div>' +
      '<div class="tools gap"><button type="submit" class="cursor-interaction gold">生成接入计划草稿</button></div></form></section>' + draft +
      '<section class="panel gap"><h3>正式连接所需资料</h3><p class="small">需要核对服务方的业务准入、已说明的后台接口和每个客户自己的独立授权。正式服务端还需要校验授权与每次请求的客户范围；AI 实际连接服务尚未开发。这里不填写密钥、密码或私人联系方式。</p>' +
      '<p class="small">各客户计划独立，复制模板从空白计划开始；草稿会在重新打开后保留。</p></section>';
  }

  function submit(tenant, formData) {
    const current = state(tenant);
    if (!current) return { notice: '无法读取当前演示客户。' };
    if (!formData || typeof formData.get !== 'function') return { notice: '无效的接入计划。' };
    const mode = formData.get('mode');
    if (typeof mode !== 'string' || !Object.prototype.hasOwnProperty.call(MODES, mode)) {
      return { notice: '请选择有效的拟接入方式。' };
    }
    const proposed = { prepared: true, mode: mode };
    for (const purpose of PURPOSES) {
      const value = formData.get(purpose.key);
      if (value !== null && value !== 'yes') return { notice: '请选择有效的拟用途。' };
      proposed[purpose.key] = value === 'yes';
    }
    if (!scopeLabels(proposed).length) return { notice: '请至少选择一项拟用途。' };
    tenant.aiAccess = proposed;
    return { notice: '已建立本次演示的接入计划草稿；尚未连接，没有实际 OAuth 授权、MCP 连接或模型请求。' };
  }

  function click(tenant, action, id) {
    if (action !== 'ai-plan-revoke' || (id !== undefined && id !== null && id !== '')) {
      return { notice: '无效的接入计划操作。' };
    }
    const plan = state(tenant);
    if (!plan) return { notice: '无法读取当前演示客户。' };
    if (!plan.prepared) return { notice: '当前客户没有接入计划；尚未连接。' };
    tenant.aiAccess = create();
    return { notice: '已撤回当前客户的接入计划草稿；尚未连接，没有撤销或改变真实授权。' };
  }

  window.RentalAI = Object.freeze({ create: create, render: render, submit: submit, click: click });
}());
