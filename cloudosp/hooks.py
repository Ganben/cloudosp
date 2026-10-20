app_name = "cloudosp"
app_title = "Cloudosp"
app_publisher = "Cloud Platform DigiOp"
app_description = "cloud operation service planner"
app_email = "cao@chaoc.net"
app_license = "mit"

# Fixtures
# ------------------
# 随应用同步的基础数据，`bench export-fixtures` 可回写这些文件

# fixtures 目录下的文件名带序号前缀，用来控制导入顺序：
# 规格字典 -> 数据中心 -> 网络分区 -> 区域 -> 资源池 -> 产品 -> 产品库存
fixtures = [
	"Lease Spec",
	"Data Center",
	"Network Zone",
	"Region",
	"Resource Pool",
	"Lease Product",
	"Lease Product Stock",
]

# Website Context
# ------------------
# 向网站导航栏追加"租赁资产前台"入口

update_website_context = "cloudosp.utils.update_website_context"

# Apps
# ------------------

# required_apps = []

# Each item in the list will be shown as an app in the apps page
add_to_apps_screen = [
	{
		"name": "cloudosp",
		"logo": "/assets/cloudosp/logo.svg",
		"title": "Cloudosp",
		"route": "/app/lease-asset",
		"has_permission": "cloudosp.api.permission.has_app_permission"
	}
]

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/cloudosp/css/cloudosp.css"
# app_include_js = "/assets/cloudosp/js/cloudosp.js"

# include js, css files in header of web template
# web_include_css = "/assets/cloudosp/css/cloudosp.css"
# web_include_js = "/assets/cloudosp/js/cloudosp.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "cloudosp/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
# doctype_js = {"doctype" : "public/js/doctype.js"}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Svg Icons
# ------------------
# include app icons in desk
# app_include_icons = "cloudosp/public/icons.svg"

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# 	"Role": "home_page"
# }

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# 	"methods": "cloudosp.utils.jinja_methods",
# 	"filters": "cloudosp.utils.jinja_filters"
# }

# Installation
# ------------

# before_install = "cloudosp.install.before_install"
# after_install = "cloudosp.install.after_install"

# Uninstallation
# ------------

# before_uninstall = "cloudosp.uninstall.before_uninstall"
# after_uninstall = "cloudosp.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "cloudosp.utils.before_app_install"
# after_app_install = "cloudosp.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "cloudosp.utils.before_app_uninstall"
# after_app_uninstall = "cloudosp.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "cloudosp.notifications.get_notification_config"

# Awesome Bar
# -----------
# Extra search results: list of dicts with label, description, route, index.
# route: ["List", "ToDo"], "/desk/docs/some/page", or "https://example.com"
# awesomebar_search = ["cloudosp.search.awesomebar_results"]

# Permissions
# -----------
# Permissions evaluated in scripted ways

# permission_query_conditions = {
# 	"Event": "frappe.desk.doctype.event.event.get_permission_query_conditions",
# }
#
# has_permission = {
# 	"Event": "frappe.desk.doctype.event.event.has_permission",
# }

# DocType Class
# ---------------
# Override standard doctype classes

# override_doctype_class = {
# 	"ToDo": "custom_app.overrides.CustomToDo"
# }

# Document Events
# ---------------
# Hook on document methods and events

# doc_events = {
# 	"*": {
# 		"on_update": "method",
# 		"on_cancel": "method",
# 		"on_trash": "method"
# 	}
# }

# Scheduled Tasks
# ---------------

# scheduler_events = {
# 	"all": [
# 		"cloudosp.tasks.all"
# 	],
# 	"daily": [
# 		"cloudosp.tasks.daily"
# 	],
# 	"hourly": [
# 		"cloudosp.tasks.hourly"
# 	],
# 	"weekly": [
# 		"cloudosp.tasks.weekly"
# 	],
# 	"monthly": [
# 		"cloudosp.tasks.monthly"
# 	],
# }

# Testing
# -------

# before_tests = "cloudosp.install.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# 	"frappe.desk.doctype.event.event.get_events": "cloudosp.event.get_events"
# }
#
# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# 	"Task": "cloudosp.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

# ignore_links_on_delete = ["Communication", "ToDo"]

# Request Events
# ----------------
# before_request = ["cloudosp.utils.before_request"]
# after_request = ["cloudosp.utils.after_request"]

# Job Events
# ----------
# before_job = ["cloudosp.utils.before_job"]
# after_job = ["cloudosp.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# 	{
# 		"doctype": "{doctype_1}",
# 		"filter_by": "{filter_by}",
# 		"redact_fields": ["{field_1}", "{field_2}"],
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_2}",
# 		"filter_by": "{filter_by}",
# 		"partial": 1,
# 	},
# 	{
# 		"doctype": "{doctype_3}",
# 		"strict": False,
# 	},
# 	{
# 		"doctype": "{doctype_4}"
# 	}
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# 	"cloudosp.auth.validate"
# ]

# Automatically update python controller files with type annotations for this app.
# export_python_type_annotations = True

# default_log_clearing_doctypes = {
# 	"Logging DocType Name": 30  # days to retain logs
# }

# Translation
# ------------
# List of apps whose translatable strings should be excluded from this app's translations.
# ignore_translatable_strings_from = []

