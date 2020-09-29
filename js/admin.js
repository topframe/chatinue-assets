$(function () {
    $(document).foundation();
    $("button.sign-out").on("click", function () {
        localStorage.removeItem("admin");
        location.href = "/admin/sign-out";
    });
});