using GeoDataProcessingTool.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSingleton<GeoClusteringService>();

var app = builder.Build();

app.MapControllers();

app.Run();
