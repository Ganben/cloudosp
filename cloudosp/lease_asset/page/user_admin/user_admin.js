frappe.pages["user-admin"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.user_admin_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("运营账号维护"),
		single_column: true,
	});

	$(`<style>
		.ua-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.ua-title { margin: 0 0 10px; font-weight: 600; }
		.ua-tabs { margin-bottom: 14px; }
		.ua-row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; flex-wrap: wrap; }
		.ua-row label { flex: 0 0 90px; font-size: 12px; color: var(--text-muted); margin: 0; }
		.ua-list th, .ua-list td { font-size: 12px; vertical-align: middle; }
		.ua-empty { color: var(--text-muted); font-size: 12px; }
		.ua-tag { font-size: 11px; color: var(--text-muted); margin-left: 6px; }
		.ua-roles { display: flex; flex-wrap: wrap; gap: 4px 14px; }
		.ua-roles label { display: flex; align-items: center; gap: 4px; font-size: 12px; margin: 0; }
	</style>`).appendTo(page.main);

	const $panel = $(`<div class="ua-panel">
		<ul class="nav nav-tabs ua-tabs">
			<li class="nav-item"><a class="nav-link active" href="#" data-tab="users">${__("用户账号")}</a></li>
			<li class="nav-item"><a class="nav-link" href="#" data-tab="pages">${__("页面权限")}</a></li>
		</ul>
		<div class="ua-body mt-3"></div>
	</div>`).appendTo(page.main);

	const $body = $panel.find(".ua-body");
	const state = {
		tab: "users",
		users: [],
		roles: [],
		pages: [],
		selected: null,
		detail: null,
	};

	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);
	const esc = (val) => frappe.utils.escape_html(val || "");

	// ------------------------------------------------ 用户账号标签
	const render_users_tab = () => {
		$body.html(`
			<div class="ua-row">
				<label>${__("搜索")}</label>
				<input class="form-control form-control-sm ua-keyword" placeholder="${__(
					"邮箱 / 姓名"
				)}" style="max-width:240px" value="${esc($body.find(".ua-keyword").val() || "")}">
				<label style="flex:0 0 auto">${__("角色")}</label>
				<select class="form-select form-select-sm ua-role-filter" style="max-width:220px">
					<option value="">${__("全部角色")}</option>
					${state.roles.map((r) => `<option value="${esc(r.name)}">${esc(r.role_name)}</option>`).join("")}
				</select>
				<button class="btn btn-sm btn-default ua-search">${__("查询")}</button>
				<button class="btn btn-sm btn-primary ua-new ml-2">${__("新建账号")}</button>
			</div>
			<div class="ua-user-list"></div>
			<div class="ua-detail mt-3"></div>
		`);

		$body.find(".ua-search").on("click", load_users);
		$body.find(".ua-keyword").on("keydown", (e) => {
			if (e.key === "Enter") load_users();
		});
		$body.find(".ua-role-filter").on("change", load_users);
		$body.find(".ua-new").on("click", new_user_dialog);

		$body.find(".ua-user-list").on("click", ".ua-select-user", function () {
			const user = $(this).attr("data-user");
			$body.find(".ua-user-list tr").removeClass("table-active");
			$(this).closest("tr").addClass("table-active");
			load_detail(user);
		});
		$body.find(".ua-user-list").on("click", ".ua-toggle", function () {
			const user = $(this).attr("data-user");
			const enabled = $(this).attr("data-enabled") === "1" ? 0 : 1;
			if (!confirm(enabled ? __("启用该账号？") : __("停用该账号？"))) return;
			api("set_enabled", { user: user, enabled: enabled }).then(load_users);
		});
		$body.find(".ua-user-list").on("click", ".ua-reset", function () {
			open_reset_dialog($(this).attr("data-user"));
		});

		load_users();
	};

	const load_users = () => {
		const keyword = $body.find(".ua-keyword").val();
		const role = $body.find(".ua-role-filter").val();
		api("get_users", { keyword: keyword, role: role })
			.then((rows) => {
				state.users = rows;
				render_user_list();
			})
			.catch((err) => $body.find(".ua-user-list").html(`<div class="ua-empty">${esc(err)}</div>`));
	};

	const render_user_list = () => {
		if (!state.users.length) {
			$body.find(".ua-user-list").html(`<div class="ua-empty">${__("没有匹配的用户")}</div>`);
			return;
		}
		$body.find(".ua-user-list").html(`
			<table class="table table-sm table-bordered ua-list">
				<thead class="thead-light"><tr>
					<th>${__("登录账号")}</th><th>${__("姓名")}</th><th>${__("角色")}</th>
					<th>${__("启用")}</th><th style="width:170px"></th>
				</tr></thead>
				<tbody>
					${state.users
						.map(
							(u) => `<tr>
								<td><a href="#" class="ua-select-user" data-user="${esc(u.name)}">${esc(u.name)}</a></td>
								<td>${esc(u.full_name)}</td>
								<td>${esc((u.roles || []).join("、"))}</td>
								<td>${u.enabled ? `<span class="badge badge-success">${__("启用")}</span>` : `<span class="badge badge-secondary">${__("停用")}</span>`}</td>
								<td>
									<button class="btn btn-xs btn-default ua-reset" data-user="${esc(u.name)}">${__("重置密码")}</button>
									<button class="btn btn-xs ${u.enabled ? "btn-warning" : "btn-success"} ua-toggle"
										data-user="${esc(u.name)}" data-enabled="${u.enabled ? 1 : 0}">
										${u.enabled ? __("停用") : __("启用")}
									</button>
								</td>
							</tr>`
						)
						.join("")}
				</tbody>
			</table>
			<div class="small text-muted">${__("提示：点击账号名查看 / 编辑角色")}</div>
		`);
	};

	const load_detail = (user) => {
		api("get_user_detail", { user: user }).then((detail) => {
			state.detail = detail;
			render_detail();
		});
	};

	const render_detail = () => {
		const d = state.detail;
		if (!d) return;
		$body.find(".ua-detail").html(`
			<h6 class="ua-title">${__("账号详情")}：${esc(d.name)}</h6>
			<div class="ua-roles mb-2">
				${state.roles
					.map(
						(r) => `<label><input type="checkbox" class="ua-role-check" value="${esc(r.name)}"
							${(d.roles || []).includes(r.name) ? "checked" : ""}> ${esc(r.role_name)}</label>`
					)
					.join("")}
			</div>
			<button class="btn btn-sm btn-primary ua-save-roles">${__("保存角色")}</button>
			<div class="ua-detail-msg mt-2 small"></div>
		`);
		$body.find(".ua-save-roles").on("click", () => {
			const roles = $body.find(".ua-role-check:checked").map(function () {
				return $(this).val();
			}).get();
			api("update_roles", { user: d.name, roles: roles })
				.then((res) => {
					$body.find(".ua-detail-msg").html(
						`<div class="text-success">${__("已保存")}：${esc((res.roles || []).join("、"))}</div>`
					);
					load_users();
				})
				.catch((err) => $body.find(".ua-detail-msg").html(`<div class="text-danger">${esc(err)}</div>`));
		});
	};

	const new_user_dialog = () => {
		const d = new frappe.ui.Dialog({
			title: __("新建运营账号"),
			fields: [
				{ fieldname: "email", fieldtype: "Data", label: __("登录账号（邮箱）"), reqd: 1 },
				{ fieldname: "first_name", fieldtype: "Data", label: __("姓名"), reqd: 1 },
				{ fieldname: "password", fieldtype: "Password", label: __("初始密码"), reqd: 1,
					description: __("至少 8 位") },
				{ fieldname: "roles", fieldtype: "MultiSelectList", label: __("角色"), options: state.roles.map((r) => ({ value: r.name, description: r.role_name })) },
			],
			primary_action_label: __("创建"),
			primary_action: (values) => {
				const roles = (values.roles || []).map((r) => r.value);
				api("create_user", {
					email: values.email,
					first_name: values.first_name,
					password: values.password,
					roles: roles,
				})
					.then((res) => {
						d.hide();
						frappe.show_alert({ message: `${__("已创建")}：${res.name}`, indicator: "green" });
						load_users();
					})
					.catch((err) => frappe.msgprint(esc(err || __("创建失败"))));
			},
		});
		d.show();
	};

	const open_reset_dialog = (user) => {
		const d = new frappe.ui.Dialog({
			title: `${__("重置密码")}：${user}`,
			fields: [
				{
					fieldname: "method",
					fieldtype: "Select",
					label: __("方式"),
					options: `\n${__("直接设置新密码")}\n${__("发送重置邮件")}`,
					default: __("直接设置新密码"),
					reqd: 1,
				},
				{ fieldname: "new_password", fieldtype: "Password", label: __("新密码"), depends_on: "eval:doc.method=='直接设置新密码'" },
			],
			primary_action_label: __("确定"),
			primary_action: (values) => {
				const by_email = values.method === __("发送重置邮件");
				api("reset_password", { user: user, new_password: by_email ? null : values.new_password, send_email: by_email ? 1 : 0 })
					.then((res) => {
						d.hide();
						frappe.show_alert({ message: `${user}：${res.method}`, indicator: "green" });
					})
					.catch((err) => frappe.msgprint(esc(err || __("重置失败"))));
			},
		});
		d.show();
	};

	// ------------------------------------------------ 页面权限标签
	const render_pages_tab = () => {
		$body.html(`
			<h6 class="ua-title">${__("页面权限（角色 → 可访问页面）")}</h6>
			<div class="small text-muted mb-2">${__(
				"页面通过角色控制访问；未设置角色的页面对所有可登录用户开放。勾选后保存即可调整。"
			)}</div>
			<div class="ua-page-list"></div>
		`);
		render_page_list();
	};

	const render_page_list = () => {
		if (!state.pages.length) {
			$body.find(".ua-page-list").html(`<div class="ua-empty">${__("暂无页面")}</div>`);
			return;
		}
		const role_names = state.roles.map((r) => r.name);
		$body.find(".ua-page-list").html(`
			<table class="table table-sm table-bordered ua-list">
				<thead class="thead-light"><tr>
					<th style="width:220px">${__("页面")}</th>
					<th>${__("可访问角色")}</th><th style="width:90px"></th>
				</tr></thead>
				<tbody>
					${state.pages
						.map((p) => `<tr>
							<td>${esc(p.title)}<span class="ua-tag">${esc(p.name)}</span></td>
							<td>
								<div class="ua-roles">
									${role_names
										.map(
											(r) => `<label><input type="checkbox" class="ua-page-role"
												data-page="${esc(p.name)}" value="${esc(r)}"
												${(p.roles || []).includes(r) ? "checked" : ""}> ${esc(r)}</label>`
										)
										.join("")}
								</div>
							</td>
							<td><button class="btn btn-xs btn-primary ua-page-save" data-page="${esc(p.name)}">${__("保存")}</button></td>
						</tr>`)
						.join("")}
				</tbody>
			</table>
		`);

		$body.find(".ua-page-save").on("click", function () {
			const page = $(this).attr("data-page");
			const roles = $body
				.find(`.ua-page-role[data-page="${page}"]:checked`)
				.map(function () {
					return $(this).val();
				})
				.get();
			api("set_page_roles", { page: page, roles: roles })
				.then((res) => {
					const p = state.pages.find((x) => x.name === page);
					if (p) p.roles = res.roles;
					frappe.show_alert({ message: `${page}：${__("已保存")}`, indicator: "green" });
				})
				.catch((err) => frappe.msgprint(esc(err || __("保存失败"))));
		});
	};

	$panel.find(".ua-tabs .nav-link").on("click", function (e) {
		e.preventDefault();
		state.tab = $(this).attr("data-tab");
		$panel.find(".ua-tabs .nav-link").removeClass("active");
		$(this).addClass("active");
		state.tab === "users" ? render_users_tab() : render_pages_tab();
	});

	const load = () => {
		api("get_roles")
			.then((roles) => {
				state.roles = roles;
			})
			.then(() => api("get_app_pages"))
			.then((pages) => {
				state.pages = pages;
			})
			.then(() => {
				state.tab === "users" ? render_users_tab() : render_pages_tab();
			});
	};

	page.set_primary_action(__("刷新"), load);

	load();
};
