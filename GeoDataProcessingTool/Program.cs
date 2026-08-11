using GeoDataProcessingTool.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.AllowAnyOrigin()
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

builder.Services.AddControllers();
builder.Services.AddSingleton<GeoClusteringService>();
builder.Services.AddSingleton<RealEstateService>();

var app = builder.Build();

app.UseCors();

app.MapControllers();

app.Run();
