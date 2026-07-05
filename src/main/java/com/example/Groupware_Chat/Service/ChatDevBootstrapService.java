package com.example.Groupware_Chat.Service;

import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ChatDevBootstrapService {

    private final JdbcTemplate jdbcTemplate;

    public ChatDevBootstrapService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void ensureChatDemoEmployees() {
        Integer devDeptId = ensureDepartment("개발팀");
        Integer planDeptId = ensureDepartment("기획팀");
        Integer adminDeptId = ensureDepartment("총무팀");
        Integer hrDeptId = ensureDepartment("인사팀");
        Integer designDeptId = ensureDepartment("디자인팀");

        Integer staffPositionId = ensurePosition("사원", 5);
        Integer leadPositionId = ensurePosition("팀장", 3);
        Integer headPositionId = ensurePosition("부서장", 2);

        insertEmployeeIfMissing("CHAT001", "홍길동", devDeptId, staffPositionId);
        insertEmployeeIfMissing("CHAT002", "김우주", devDeptId, leadPositionId);
        insertEmployeeIfMissing("CHAT003", "이다니엘", planDeptId, leadPositionId);
        insertEmployeeIfMissing("CHAT004", "김영훈", adminDeptId, headPositionId);
        insertEmployeeIfMissing("CHAT005", "정진국", hrDeptId, staffPositionId);
        insertEmployeeIfMissing("CHAT006", "박서연", designDeptId, staffPositionId);
    }

    public List<Map<String, Object>> findChatCandidates(Integer myEmployeeId) {
        return jdbcTemplate.queryForList("""
                SELECT
                    e.EMPLOYEE_ID AS employeeId,
                    e.EMPLOYEE_NAME AS employeeName,
                    COALESCE(d.DEPT_NAME, '') AS deptName,
                    COALESCE(p.POSITION_NAME, '') AS positionName
                FROM EMPLOYEE e
                LEFT JOIN DEPARTMENT d ON d.DEPT_ID = e.DEPT_ID
                LEFT JOIN POSITION p ON p.POSITION_ID = e.POSITION_ID
                WHERE e.EMPLOYEE_STATUS = 'ACTIVE'
                  AND e.EMPLOYEE_ID != ?
                ORDER BY d.DEPT_NAME, p.POSITION_RANK, e.EMPLOYEE_NAME
                """, myEmployeeId);
    }

    private void insertEmployeeIfMissing(String employeeNo, String employeeName,
                                         Integer deptId, Integer positionId) {
        jdbcTemplate.update("""
                INSERT INTO EMPLOYEE (
                    EMPLOYEE_NO, EMPLOYEE_PWD, EMPLOYEE_NAME,
                    DEPT_ID, POSITION_ID, EMPLOYEE_ROLE,
                    EMPLOYEE_STATUS, HIRE_DATE
                )
                SELECT ?, '1234', ?, ?, ?, 'EMPLOYEE', 'ACTIVE', CURDATE()
                WHERE NOT EXISTS (
                    SELECT 1 FROM EMPLOYEE WHERE EMPLOYEE_NO = ?
                )
                """, employeeNo, employeeName, deptId, positionId, employeeNo);
        jdbcTemplate.update("""
                UPDATE EMPLOYEE
                SET EMPLOYEE_NAME = ?, DEPT_ID = ?, POSITION_ID = ?, EMPLOYEE_STATUS = 'ACTIVE'
                WHERE EMPLOYEE_NO = ?
                """, employeeName, deptId, positionId, employeeNo);
    }

    private Integer ensureDepartment(String deptName) {
        jdbcTemplate.update("""
                INSERT INTO DEPARTMENT (DEPT_NAME)
                SELECT ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM DEPARTMENT WHERE DEPT_NAME = ?
                )
                """, deptName, deptName);
        return jdbcTemplate.queryForObject(
                "SELECT DEPT_ID FROM DEPARTMENT WHERE DEPT_NAME = ? LIMIT 1",
                Integer.class, deptName);
    }

    private Integer ensurePosition(String positionName, int rank) {
        jdbcTemplate.update("""
                INSERT INTO POSITION (POSITION_NAME, POSITION_RANK)
                SELECT ?, ?
                WHERE NOT EXISTS (
                    SELECT 1 FROM POSITION WHERE POSITION_NAME = ?
                )
                """, positionName, rank, positionName);
        return jdbcTemplate.queryForObject(
                "SELECT POSITION_ID FROM POSITION WHERE POSITION_NAME = ? LIMIT 1",
                Integer.class, positionName);
    }
}
