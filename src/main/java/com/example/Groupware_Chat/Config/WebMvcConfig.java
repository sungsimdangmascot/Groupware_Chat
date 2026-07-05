package com.example.Groupware_Chat.Config;

import java.nio.file.Path;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String uploadPath = Path.of("uploads", "chat").toAbsolutePath().normalize().toUri().toString();
        registry.addResourceHandler("/uploads/chat/**")
                .addResourceLocations(uploadPath);
    }
}
