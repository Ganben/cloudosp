// cloudosp：在各业务页面底部注入「提交 Issue」按钮
// 通过 hooks 的 app_include_js 全局加载，按页面路由自动挂载
(function () {
	const APP_PAGES = [
		"lease-asset-dashboard",
		"ops-dashboard",
		"lease-plan-board",
		"product-catalog-admin",
		"resource-pool-admin",
		"expansion-control",
		"asset-receipt",
		"lease-request-process",
		"user-admin",
		"issue-list",
	];

	function esc(val) {
		return frappe.utils.escape_html(val || "");
	}

	function inject() {
		if (!frappe.get_route) return;
		const route = frappe.get_route_str();
		if (APP_PAGES.indexOf(route) === -1) return;

		const $page = $("#page-" + route);
		if (!$page.length || $page.find(".cloudosp-issue-btn").length) return;

		const $holder = $page.find(".layout-main").length ? $page.find(".layout-main") : $page;
		$holder.append(
			`<div class="text-center my-4"><button class="btn btn-sm btn-default cloudosp-issue-btn">${__(
				"提交 Issue"
			)}</button></div>`
		);
		$page.off("click", ".cloudosp-issue-btn").on("click", ".cloudosp-issue-btn", () => open_dialog(route));
	}

	function open_dialog(page_name) {
		const d = new frappe.ui.Dialog({
			title: __("提交 Issue"),
			fields: [
				{ fieldname: "title", fieldtype: "Data", label: __("标题"), reqd: 1 },
				{
					fieldname: "page",
					fieldtype: "Data",
					label: __("Page"),
					default: page_name,
					read_only: 1,
					description: __("自动带上当前页面"),
				},
				{ fieldname: "description", fieldtype: "Small Text", label: __("正文"), reqd: 1 },
			],
			primary_action_label: __("提交"),
			primary_action(values) {
				frappe
					.xcall("cloudosp.lease_asset.issue_api.create_issue", {
						page: page_name,
						title: values.title,
						description: values.description,
					})
					.then((res) => {
						d.hide();
						frappe.show_alert({
							message: `${__("Issue 已提交")}：${res.name}`,
							indicator: "green",
						});
					})
					.catch((err) => frappe.msgprint(esc(err || __("提交失败"))));
			},
		});
		d.show();
	}

	if (frappe.router && frappe.router.on) {
		frappe.router.on("change", inject);
	}
	$(document).on("page-change", inject);
	$(function () {
		setTimeout(inject, 600);
		setTimeout(inject, 2000);
	});
})();
