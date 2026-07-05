package com.example.Groupware_Chat;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.mybatis.spring.annotation.MapperScan;

@SpringBootApplication
@MapperScan("com.example.Groupware_Chat.Mapper")
public class GroupwareChatApplication {

	public static void main(String[] args) {
		SpringApplication.run(GroupwareChatApplication.class, args);
	}

}
