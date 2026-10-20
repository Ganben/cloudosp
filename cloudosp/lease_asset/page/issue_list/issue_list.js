frappe.pages["issue-list"].on_page_load = function (wrapper) {
	const API = "cloudosp.lease_asset.issue_api";

	const page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Issue 列表"),
		single_column: true,
	});

	$(`<style>
		.il-panel { background: var(--fg-color); border-radius: var(--border-radius-md); padding: 16px; }
		.il-list th, .il-list td { font-size: 12px; vertical-align: top; }
		.il-desc { color: var(--text-muted); white-space: pre-wrap; }
	</style>`).appendTo(page.main);

	const $panel = $(`<div class="il-panel">
		<div class="il-filter mb-3"></div>
		<div class="il-list"></div>
	</div>`).appendTo(page.main);

	const state = { issues: [], status: "" };
	const api = (method, args) => frappe.xcall(`${API}.${method}`, args);
	const esc = (val) => frappe.utils.escape_html(val || "");

	const render_filter = () => {
		$panel.find(".il-filter").html(`
			<div class="d-flex align-items-center">
				<select class="form-select form-select-sm il-status" style="max-width:200px">
					<option value="">${__("全部状态")}</option>
					<option value="待处理" ${state.status === "待处理" ? "selected" : ""}>${__("待处理")}</option>
					<option value="已处理" ${state.status === "已处理" ? "selected" : ""}>${__("已处理")}</option>
				</select>
				<button class="btn btn-sm btn-default ml-2 il-refresh">${__("刷新")}</button>
			</div>
		`);
		$panel.find(".il-status").on("change", load);
		$panel.find(".il-refresh").on("click", load);
	};

	const render_list = () => {
		const $list = $panel.find(".il-list");
		if (!state.issues.length) {
			$list.html(`<div class="il-empty">${__("暂无 Issue")}</div>`);
			return;
		}

		$list.html(`
			<table class="table table-sm table-bordered il-list">
				<thead class="thead-light"><tr>
					<th style="width:130px">${__("编号")}</th>
					<th style="width:30%">${__("标题")}</th>
					<th>${__("正文")}</th>
					<th style="width:150px">${__("Page")}</th>
					<th style="width:150px">${__("提交人")}</th>
					<th style="width:150px">${__("提交时间")}</th>
					<th style="width:110px">${__("状态")}</th>
				</tr></thead>
				<tbody>
					${state.issues
						.map(
							(row) => `<tr>
								<td>${esc(row.name)}</td>
								<td><b>${esc(row.title)}</b></td>
								<td class="il-desc">${esc(row.description)}</td>
								<td>${esc(row.page_title || row.page || "-")}</td>
								<td>${esc(row.submitted_by_name || row.submitted_by || "-")}</td>
								<td>${esc(row.submitted_at || "")}</td>
								<td>
									<span class="badge ${row.status === "待处理" ? "badge-warning" : "badge-success"}">${esc(row.status)}</span>
									<button class="btn btn-xs btn-default il-toggle d-block mt-1"
										data-name="${esc(row.name)}" data-status="${esc(row.status)}">
										${row.status === "待处理" ? __("标记已处理") : __("重新打开")}
									</button>
								</td>
							</tr>`
						)
						.join("")}
				</tbody>
			</table>
		`);

		$list.find(".il-toggle").on("click", function () {
			const name = $(this).attr("data-name");
			const next = $(this).attr("data-status") === "待处理" ? "已处理" : "待处理";
			api("set_status", { name: name, status: next }).then(load);
		});
	};

	const load = () => {
		$panel.find(".il-list").html(`<div class="il-empty">${__("加载中")}...</div>`);
		api("get_issues", { status: $panel.find(".il-status").val() || "" })
			.then((rows) => {
				state.issues = rows;
				render_list();
			})
			.catch((err) => $panel.find(".il-list").html(`<div class="il-empty">${esc(err || __("加载失败"))}</div>`));
	};

	page.set_primary_action(__("刷新"), load);

	render_filter();
	load();
};
